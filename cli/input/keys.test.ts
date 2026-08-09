import { assertEquals } from "@std/assert";
import { decodeKeys, KeyDecoder, type KeyEvent, type KeyName } from "./keys.ts";

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

/** Compact view of an event stream, so assertions read as intent rather than shape. */
function summarize(events: KeyEvent[]): string[] {
	return events.map((e) => {
		const mods = [
			e.ctrl ? "ctrl" : "",
			e.alt ? "alt" : "",
			e.shift ? "shift" : "",
			e.meta ? "meta" : "",
		].filter(Boolean).join("+");
		const payload = e.name === "char" ? `(${e.char})` : e.name === "paste" ? `(${e.text})` : "";
		return `${mods ? mods + "+" : ""}${e.name}${payload}`;
	});
}

function assertKeys(input: string, expected: string[]) {
	assertEquals(summarize(decodeKeys(bytes(input))), expected);
}

Deno.test("decodes printable ASCII", () => {
	assertKeys("abc", ["char(a)", "char(b)", "char(c)"]);
	assertKeys(" ", ["char( )"]);
});

Deno.test("decodes the editing control characters", () => {
	assertKeys("\r", ["enter"]);
	assertKeys("\n", ["enter"]);
	assertKeys("\x7f", ["backspace"]);
	assertKeys("\x08", ["backspace"]);
	assertKeys("\t", ["tab"]);
});

Deno.test("decodes ctrl+letter", () => {
	assertKeys("\x03", ["ctrl+char(c)"]);
	assertKeys("\x04", ["ctrl+char(d)"]);
	assertKeys("\x01\x05\x0b\x15\x17", [
		"ctrl+char(a)",
		"ctrl+char(e)",
		"ctrl+char(k)",
		"ctrl+char(u)",
		"ctrl+char(w)",
	]);
});

Deno.test("decodes CSI arrows", () => {
	assertKeys("\x1b[A", ["up"]);
	assertKeys("\x1b[B", ["down"]);
	assertKeys("\x1b[C", ["right"]);
	assertKeys("\x1b[D", ["left"]);
});

Deno.test("decodes SS3 arrows and function keys", () => {
	// Application-cursor mode. The old decoder dropped these entirely, which is
	// why arrows appeared dead in some terminals.
	assertKeys("\x1bOA", ["up"]);
	assertKeys("\x1bOB", ["down"]);
	assertKeys("\x1bOC", ["right"]);
	assertKeys("\x1bOD", ["left"]);
	assertKeys("\x1bOH", ["home"]);
	assertKeys("\x1bOF", ["end"]);
	assertKeys("\x1bOP", ["f1"]);
	assertKeys("\x1bOS", ["f4"]);
});

Deno.test("decodes modified keys", () => {
	// The fixed three-byte stride used to mis-parse every one of these.
	assertKeys("\x1b[1;5A", ["ctrl+up"]);
	assertKeys("\x1b[1;2D", ["shift+left"]);
	assertKeys("\x1b[1;3B", ["alt+down"]);
	assertKeys("\x1b[1;6C", ["ctrl+shift+right"]);
	assertKeys("\x1b[3;5~", ["ctrl+delete"]);
});

Deno.test("decodes home and end in all four encodings", () => {
	assertKeys("\x1b[H", ["home"]);
	assertKeys("\x1b[F", ["end"]);
	assertKeys("\x1b[1~", ["home"]);
	assertKeys("\x1b[4~", ["end"]);
	assertKeys("\x1b[7~", ["home"]);
	assertKeys("\x1b[8~", ["end"]);
	assertKeys("\x1bOH", ["home"]);
	assertKeys("\x1bOF", ["end"]);
});

Deno.test("decodes the remaining tilde keys", () => {
	assertKeys("\x1b[2~", ["insert"]);
	assertKeys("\x1b[3~", ["delete"]);
	assertKeys("\x1b[5~", ["pageup"]);
	assertKeys("\x1b[6~", ["pagedown"]);
	assertKeys("\x1b[15~", ["f5"]);
	assertKeys("\x1b[24~", ["f12"]);
});

Deno.test("decodes shift+tab", () => {
	assertKeys("\x1b[Z", ["shift+tab"]);
});

Deno.test("decodes alt+char and alt+escape", () => {
	assertKeys("\x1ba", ["alt+char(a)"]);
	assertKeys("\x1b\x1b", ["alt+escape"]);
});

Deno.test("decodes UTF-8 input", () => {
	// The old ASCII-only gate dropped every one of these silently.
	assertKeys("é", ["char(é)"]);
	assertKeys("→", ["char(→)"]);
	assertKeys("🙂", ["char(🙂)"]);
	assertKeys("naïve", ["char(n)", "char(a)", "char(ï)", "char(v)", "char(e)"]);
});

Deno.test("collects a bracketed paste into one event", () => {
	assertKeys("\x1b[200~hello\x1b[201~", ["paste(hello)"]);
	// A newline inside a paste must not fire Enter mid-paste.
	assertKeys("\x1b[200~a\nb\x1b[201~", ["paste(a\nb)"]);
	assertKeys("x\x1b[200~p\x1b[201~y", ["char(x)", "paste(p)", "char(y)"]);
});

Deno.test("a lone ESC is held until flush", () => {
	const d = new KeyDecoder();
	assertEquals(d.push(bytes("\x1b")), []);
	assertEquals(summarize(d.flush()), ["escape"]);
});

Deno.test("a lone ESC is not emitted when a sequence completes", () => {
	// The old decoder emitted Escape here because the chunk ended after ESC.
	const d = new KeyDecoder();
	assertEquals(d.push(bytes("\x1b")), []);
	assertEquals(summarize(d.push(bytes("[A"))), ["up"]);
	assertEquals(d.flush(), []);
});

Deno.test("flush drains ESC followed by ordinary input", () => {
	const d = new KeyDecoder();
	d.push(bytes("\x1b"));
	assertEquals(summarize(d.flush()), ["escape"]);
});

Deno.test("reset discards a partial sequence", () => {
	const d = new KeyDecoder();
	d.push(bytes("\x1b["));
	d.reset();
	assertEquals(summarize(d.push(bytes("a"))), ["char(a)"]);
});

Deno.test("an unterminated CSI stays bounded rather than buffering forever", () => {
	// Parameter bytes with no final byte can never complete, so without a cap the
	// carry would grow for as long as the garbage kept arriving.
	const d = new KeyDecoder();
	const events = d.push(bytes("\x1b[" + "1;".repeat(2000)));
	assertEquals(summarize(events), ["unknown"]);
	// The decoder is still usable afterwards.
	assertEquals(summarize(d.push(bytes("a"))), ["char(a)"]);
});

Deno.test("malformed CSI does not stall the decoder", () => {
	// Each ESC [ ESC is consumed as one bad sequence, leaving the "[" as text —
	// the point being that the stream keeps advancing instead of deadlocking.
	const d = new KeyDecoder();
	const events = d.push(bytes("\x1b[".repeat(64)));
	assertEquals(events.length > 0, true);
	assertEquals(summarize(d.push(bytes("\r"))), ["enter"]);
});

/**
 * The load-bearing test: a terminal read boundary can fall anywhere, so decoding
 * must not depend on how a byte string is chunked. Splitting at every offset and
 * demanding an identical event stream covers the whole carry-over bug class.
 */
Deno.test("decoding is invariant under chunk boundaries", () => {
	const inputs = [
		"\x1b[A",
		"\x1b[1;5A",
		"\x1b[3~",
		"\x1bOA",
		"\x1b[200~hello world\x1b[201~",
		"abc\x1b[Bdef",
		"🙂é→",
		"\x1b[15~\x1b[24~",
		"\x1b[1;6C\r\x7f",
	];

	for (const input of inputs) {
		const raw = bytes(input);
		const expected = summarize(decodeKeys(raw));
		for (let k = 1; k < raw.length; k++) {
			const d = new KeyDecoder();
			const got = summarize([
				...d.push(raw.subarray(0, k)),
				...d.push(raw.subarray(k)),
				...d.flush(),
			]);
			assertEquals(got, expected, `${JSON.stringify(input)} split at ${k}`);
		}
	}
});

Deno.test("decoding is invariant under byte-at-a-time delivery", () => {
	const input = "\x1b[1;5A\x1b[200~hi\x1b[201~x🙂";
	const raw = bytes(input);
	const expected = summarize(decodeKeys(raw));

	const d = new KeyDecoder();
	const got: KeyEvent[] = [];
	for (const byte of raw) got.push(...d.push(new Uint8Array([byte])));
	got.push(...d.flush());

	assertEquals(summarize(got), expected);
});

Deno.test("sequence carries the raw bytes", () => {
	const [event] = decodeKeys(bytes("\x1b[1;5A"));
	assertEquals(event.sequence, "\x1b[1;5A");
	const [cr] = decodeKeys(bytes("\r"));
	assertEquals(cr.sequence, "\r");
	const [lf] = decodeKeys(bytes("\n"));
	assertEquals(lf.sequence, "\n");
});

Deno.test("every decoded name is a known KeyName", () => {
	const names: KeyName[] = decodeKeys(bytes("a\r\x1b[A\x1b[3~\t")).map((e) => e.name);
	assertEquals(names, ["char", "enter", "up", "delete", "tab"]);
});
