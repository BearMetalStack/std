/**
 * Byte-level keyboard decoding.
 *
 * Pure: no Deno APIs, no I/O, no global state. {@linkcode KeyDecoder} is fed raw
 * chunks and returns complete events, retaining anything incomplete for the next
 * chunk — a terminal read boundary can land in the middle of an escape sequence
 * or a UTF-8 code point, and a decoder that assumes otherwise misreads keys in a
 * way that only shows up under fast input or paste.
 * @module
 */

/** A named key, or `char` for ordinary text and `paste` for a bracketed-paste burst. */
export type KeyName =
	| "char"
	| "paste"
	| "enter"
	| "escape"
	| "backspace"
	| "delete"
	| "tab"
	| "up"
	| "down"
	| "left"
	| "right"
	| "home"
	| "end"
	| "pageup"
	| "pagedown"
	| "insert"
	| "f1"
	| "f2"
	| "f3"
	| "f4"
	| "f5"
	| "f6"
	| "f7"
	| "f8"
	| "f9"
	| "f10"
	| "f11"
	| "f12"
	| "unknown";

/** Modifier flags decoded from a key sequence. */
export interface KeyModifiers {
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
}

/** A single decoded keypress. */
export interface KeyEvent extends KeyModifiers {
	name: KeyName;
	/** The character produced, when `name` is `"char"`. */
	char?: string;
	/** The pasted text, when `name` is `"paste"`. */
	text?: string;
	/** The raw bytes this event was decoded from, as text. */
	sequence: string;
}

const ESC = 0x1b;
const PASTE_START = "200";
const PASTE_END = "201";

/** Beyond this, a stream of unterminated escape bytes is treated as garbage rather than buffered. */
const MAX_CARRY = 1024;

const decoder = new TextDecoder();

function noMods(): KeyModifiers {
	return { ctrl: false, alt: false, shift: false, meta: false };
}

/**
 * Decodes an xterm modifier parameter.
 *
 * The wire value is a 1-based bitmask: subtract one, then bit 0 is shift, 1 is
 * alt, 2 is ctrl, 3 is meta.
 */
function modsFromParam(param: number | undefined): KeyModifiers {
	if (!param || param < 1) return noMods();
	const bits = param - 1;
	return {
		shift: (bits & 1) !== 0,
		alt: (bits & 2) !== 0,
		ctrl: (bits & 4) !== 0,
		meta: (bits & 8) !== 0,
	};
}

/** Final byte of a CSI/SS3 sequence to key name, for the cursor and editing keys. */
const FINAL_KEYS: Record<string, KeyName> = {
	A: "up",
	B: "down",
	C: "right",
	D: "left",
	H: "home",
	F: "end",
	P: "f1",
	Q: "f2",
	R: "f3",
	S: "f4",
};

/** Numeric parameter of a `CSI n ~` sequence to key name. */
const TILDE_KEYS: Record<number, KeyName> = {
	1: "home",
	2: "insert",
	3: "delete",
	4: "end",
	5: "pageup",
	6: "pagedown",
	7: "home",
	8: "end",
	11: "f1",
	12: "f2",
	13: "f3",
	14: "f4",
	15: "f5",
	17: "f6",
	18: "f7",
	19: "f8",
	20: "f9",
	21: "f10",
	23: "f11",
	24: "f12",
};

/** Byte length of a UTF-8 sequence from its lead byte, or 0 if not a lead byte. */
function utf8Length(byte: number): number {
	if (byte >= 0xc0 && byte <= 0xdf) return 2;
	if (byte >= 0xe0 && byte <= 0xef) return 3;
	if (byte >= 0xf0 && byte <= 0xf7) return 4;
	return 0;
}

/** Signals that the parser needs more bytes before it can produce an event. */
const INCOMPLETE = Symbol("incomplete");

interface Parsed {
	event: KeyEvent | null;
	length: number;
}

/**
 * Incremental keyboard decoder.
 *
 * Feed it every chunk read from stdin; it returns the events that are complete
 * and holds back any trailing partial sequence until the next chunk.
 */
export class KeyDecoder {
	#carry = new Uint8Array(0);

	/** Decodes a chunk, returning every event that completed within it. */
	push(bytes: Uint8Array): KeyEvent[] {
		let buf: Uint8Array;
		if (this.#carry.length === 0) {
			buf = bytes;
		} else {
			buf = new Uint8Array(this.#carry.length + bytes.length);
			buf.set(this.#carry, 0);
			buf.set(bytes, this.#carry.length);
		}
		this.#carry = new Uint8Array(0);

		const events: KeyEvent[] = [];
		let i = 0;
		while (i < buf.length) {
			const result = this.#parseOne(buf, i);
			if (result === INCOMPLETE) {
				const rest = buf.subarray(i);
				if (rest.length > MAX_CARRY) {
					events.push({ name: "unknown", ...noMods(), sequence: decoder.decode(rest) });
				} else {
					this.#carry = rest.slice();
				}
				return events;
			}
			if (result.event) events.push(result.event);
			i += result.length;
		}
		return events;
	}

	/**
	 * Resolves whatever is still buffered.
	 *
	 * A trailing lone `ESC` is ambiguous — it is either the Escape key or the start
	 * of a sequence whose remainder has not arrived. The reader holds it briefly and
	 * calls this when no more bytes follow, at which point it really was Escape.
	 */
	flush(): KeyEvent[] {
		const carry = this.#carry;
		this.#carry = new Uint8Array(0);
		if (carry.length === 0) return [];

		if (carry[0] === ESC) {
			const events: KeyEvent[] = [
				{ name: "escape", ...noMods(), sequence: "\x1b" },
			];
			if (carry.length > 1) events.push(...this.push(carry.subarray(1)));
			return events;
		}
		return [{ name: "unknown", ...noMods(), sequence: decoder.decode(carry) }];
	}

	/** Discards any buffered partial sequence. */
	reset() {
		this.#carry = new Uint8Array(0);
	}

	/**
	 * Whether an incomplete sequence is being held.
	 *
	 * The reader uses this to decide whether it needs a flush timer at all — arming
	 * one unconditionally would keep the event loop alive between keystrokes.
	 */
	get pending(): boolean {
		return this.#carry.length > 0;
	}

	#parseOne(buf: Uint8Array, start: number): Parsed | typeof INCOMPLETE {
		const byte = buf[start];
		if (byte === ESC) return this.#parseEscape(buf, start);

		const seq = (len: number) => decoder.decode(buf.subarray(start, start + len));

		if (byte === 0x0d || byte === 0x0a) {
			return { event: { name: "enter", ...noMods(), sequence: seq(1) }, length: 1 };
		}
		if (byte === 0x09) {
			return { event: { name: "tab", ...noMods(), sequence: seq(1) }, length: 1 };
		}
		if (byte === 0x7f || byte === 0x08) {
			return { event: { name: "backspace", ...noMods(), sequence: seq(1) }, length: 1 };
		}
		if (byte === 0x00) {
			return {
				event: { name: "char", ...noMods(), ctrl: true, char: " ", sequence: seq(1) },
				length: 1,
			};
		}
		if (byte >= 0x01 && byte <= 0x1a) {
			return {
				event: {
					name: "char",
					...noMods(),
					ctrl: true,
					char: String.fromCharCode(byte + 0x60),
					sequence: seq(1),
				},
				length: 1,
			};
		}
		if (byte >= 0x1c && byte <= 0x1f) {
			return {
				event: {
					name: "char",
					...noMods(),
					ctrl: true,
					char: String.fromCharCode(byte + 0x40),
					sequence: seq(1),
				},
				length: 1,
			};
		}

		if (byte >= 0x20 && byte < 0x7f) {
			return {
				event: {
					name: "char",
					...noMods(),
					char: String.fromCharCode(byte),
					sequence: seq(1),
				},
				length: 1,
			};
		}

		const len = utf8Length(byte);
		if (len > 0) {
			if (start + len > buf.length) return INCOMPLETE;
			const text = decoder.decode(buf.subarray(start, start + len));
			return {
				event: { name: "char", ...noMods(), char: text, sequence: text },
				length: len,
			};
		}

		return {
			event: { name: "unknown", ...noMods(), sequence: seq(1) },
			length: 1,
		};
	}

	#parseEscape(buf: Uint8Array, start: number): Parsed | typeof INCOMPLETE {
		if (start + 1 >= buf.length) return INCOMPLETE;
		const next = buf[start + 1];

		if (next === 0x5b) return this.#parseCsi(buf, start); // '['
		if (next === 0x4f) return this.#parseSs3(buf, start); // 'O'

		if (next === ESC) {
			return {
				event: { name: "escape", ...noMods(), alt: true, sequence: "\x1b\x1b" },
				length: 2,
			};
		}

		// ESC <char> is alt+<char>.
		const inner = this.#parseOne(buf, start + 1);
		if (inner === INCOMPLETE) return INCOMPLETE;
		if (!inner.event) return { event: null, length: inner.length + 1 };
		return {
			event: {
				...inner.event,
				alt: true,
				sequence: "\x1b" + inner.event.sequence,
			},
			length: inner.length + 1,
		};
	}

	#parseCsi(buf: Uint8Array, start: number): Parsed | typeof INCOMPLETE {
		let i = start + 2;
		while (i < buf.length && buf[i] >= 0x30 && buf[i] <= 0x3f) i++;
		while (i < buf.length && buf[i] >= 0x20 && buf[i] <= 0x2f) i++;
		if (i >= buf.length) return INCOMPLETE;
		const final = buf[i];
		if (final < 0x40 || final > 0x7e) {
			return {
				event: {
					name: "unknown",
					...noMods(),
					sequence: decoder.decode(buf.subarray(start, i + 1)),
				},
				length: i + 1 - start,
			};
		}

		const paramText = decoder.decode(buf.subarray(start + 2, i));
		const sequence = decoder.decode(buf.subarray(start, i + 1));
		const length = i + 1 - start;
		const finalChar = String.fromCharCode(final);

		if (finalChar === "~" && paramText === PASTE_START) {
			return this.#parsePaste(buf, start, i + 1);
		}

		const params = paramText.split(";").map((p) => (p === "" ? undefined : Number(p)));

		if (finalChar === "~") {
			const name = TILDE_KEYS[params[0] ?? -1];
			return {
				event: {
					name: name ?? "unknown",
					...modsFromParam(params[1]),
					sequence,
				},
				length,
			};
		}

		if (finalChar === "Z") {
			return {
				event: { name: "tab", ...noMods(), shift: true, sequence },
				length,
			};
		}

		const name = FINAL_KEYS[finalChar];
		if (!name) {
			return { event: { name: "unknown", ...noMods(), sequence }, length };
		}
		return { event: { name, ...modsFromParam(params[1]), sequence }, length };
	}

	/**
	 * Parses SS3 — `ESC O` plus one final byte.
	 *
	 * This is what a terminal in application-cursor mode sends for the arrows, and
	 * what many send for F1-F4 and Home/End. Handling only CSI is why arrows went
	 * dead in some terminals.
	 */
	#parseSs3(buf: Uint8Array, start: number): Parsed | typeof INCOMPLETE {
		if (start + 2 >= buf.length) return INCOMPLETE;
		const sequence = decoder.decode(buf.subarray(start, start + 3));
		const name = FINAL_KEYS[String.fromCharCode(buf[start + 2])];
		return {
			event: { name: name ?? "unknown", ...noMods(), sequence },
			length: 3,
		};
	}

	/** Collects a bracketed-paste burst into one event so it can be inserted atomically. */
	#parsePaste(buf: Uint8Array, start: number, bodyStart: number): Parsed | typeof INCOMPLETE {
		for (let i = bodyStart; i + 5 < buf.length; i++) {
			if (buf[i] !== ESC) continue;
			if (buf[i + 1] !== 0x5b) continue;
			const marker = decoder.decode(buf.subarray(i + 2, i + 5));
			if (marker !== PASTE_END || buf[i + 5] !== 0x7e) continue;
			const text = decoder.decode(buf.subarray(bodyStart, i));
			return {
				event: {
					name: "paste",
					...noMods(),
					text,
					sequence: decoder.decode(buf.subarray(start, i + 6)),
				},
				length: i + 6 - start,
			};
		}
		return INCOMPLETE;
	}
}

/** Convenience for tests and one-shot decoding: bytes in, events out. */
export function decodeKeys(bytes: Uint8Array): KeyEvent[] {
	const d = new KeyDecoder();
	return [...d.push(bytes), ...d.flush()];
}
