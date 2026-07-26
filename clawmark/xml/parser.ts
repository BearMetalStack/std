import type { XmlElement, XmlMode, XmlNode, XmlParseError, XmlParseOptions } from "./types.ts";
import { DOCUMENT_NAME } from "./types.ts";
import { decodeEntities } from "./entities.ts";
import { AUTO_CLOSE, ESCAPABLE_RAW, RAW_TEXT, VOID } from "./html_tables.ts";

/**
 * Portable XML/HTML tokenizer. Deliberately shaped like clawmark's own
 * `Lexer` - a cursor, private `#peek`/`#toNext` helpers, and one top-level
 * `while (cursor < len)` loop - so the two parsers in this package read alike.
 *
 * Zero dependencies and zero host APIs: no DOMParser, no `Deno.*`, nothing
 * from `globalThis`. It runs identically in Deno, a browser, and a worker.
 */
export class XmlParser {
	#input: string;
	#cursor = 0;
	#mode: XmlMode;
	#opts: XmlParseOptions;
	/** One frame per open element; maps prefix ("" for default) to URI. */
	#nsStack: Map<string, string>[] = [];
	#open: XmlElement[] = [];
	#root: XmlElement;

	constructor(input: string, opts: XmlParseOptions = {}) {
		this.#input = input;
		this.#opts = opts;
		this.#mode = opts.mode ?? "xml";
		this.#root = {
			kind: "element",
			name: DOCUMENT_NAME,
			qname: DOCUMENT_NAME,
			attrs: new Map(),
			children: [],
		};
	}

	// ---- diagnostics -----------------------------------------------------

	#error(code: XmlParseError["code"], message: string, offset = this.#cursor) {
		let line = 1;
		let last = -1;
		for (let i = 0; i < offset && i < this.#input.length; i++) {
			if (this.#input[i] === "\n") {
				line++;
				last = i;
			}
		}
		const err: XmlParseError = { code, message, offset, line, column: offset - last };
		if (this.#opts.strict) throw new Error(`${code} at ${line}:${err.column}: ${message}`);
		this.#opts.onError?.(err);
	}

	// ---- scanning primitives --------------------------------------------

	#peek(length: number, offset = 0): string {
		return this.#input.slice(this.#cursor + offset, this.#cursor + offset + length);
	}

	/** Index of `sub` at or after the cursor, or -1. */
	#indexOf(sub: string, from = this.#cursor): number {
		return this.#input.indexOf(sub, from);
	}

	#decode(raw: string): string {
		return decodeEntities(raw, this.#opts.entities, (name, off) => {
			this.#error("bad-entity", `unknown entity ${name}`, off);
		});
	}

	// ---- namespaces ------------------------------------------------------

	#lookupNs(prefix: string): string | undefined {
		for (let i = this.#nsStack.length - 1; i >= 0; i--) {
			const hit = this.#nsStack[i].get(prefix);
			if (hit !== undefined) return hit;
		}
		return undefined;
	}

	// ---- tree helpers ----------------------------------------------------

	get #parent(): XmlElement {
		return this.#open[this.#open.length - 1] ?? this.#root;
	}

	#append(node: XmlNode) {
		const parent = this.#parent;
		node.parent = parent;
		parent.children.push(node);
	}

	#appendText(value: string) {
		if (value === "") return;
		const parent = this.#parent;
		const last = parent.children[parent.children.length - 1];
		// Merge into a trailing text sibling so entity decoding never leaves a
		// run of adjacent text nodes for the crawler to stitch back together.
		if (last?.kind === "text") {
			last.value += value;
			return;
		}
		this.#append({ kind: "text", value });
	}

	// ---- main loop -------------------------------------------------------

	parse(): XmlElement {
		const len = this.#input.length;

		while (this.#cursor < len) {
			const ch = this.#input[this.#cursor];

			if (ch !== "<") {
				this.#text();
				continue;
			}

			const next = this.#input[this.#cursor + 1];

			if (this.#peek(4) === "<!--") this.#comment();
			else if (this.#peek(9) === "<![CDATA[") this.#cdata();
			else if (this.#peek(2) === "<!") this.#doctype();
			else if (this.#peek(2) === "<?") this.#pi();
			else if (next === "/") this.#closeTag();
			else if (this.#mode === "html" && !/[a-zA-Z]/.test(next ?? "")) {
				// A `<` that cannot begin a tag is literal text in html mode.
				this.#appendText("<");
				this.#cursor++;
			} else if (next === undefined) {
				this.#error("eof-in-tag", "input ends with `<`");
				this.#appendText("<");
				this.#cursor++;
			} else this.#openTag();
		}

		// Anything still open at EOF is implicitly closed.
		while (this.#open.length > 0) {
			const el = this.#open.pop()!;
			this.#nsStack.pop();
			this.#error("unclosed", `<${el.qname}> was never closed`);
		}

		return this.#root;
	}

	#text() {
		const next = this.#indexOf("<");
		const end = next < 0 ? this.#input.length : next;
		this.#appendText(this.#decode(this.#input.slice(this.#cursor, end)));
		this.#cursor = end;
	}

	#comment() {
		const end = this.#indexOf("-->", this.#cursor + 4);
		const stop = end < 0 ? this.#input.length : end;
		if (this.#opts.preserveComments) {
			this.#append({ kind: "comment", value: this.#input.slice(this.#cursor + 4, stop) });
		}
		this.#cursor = end < 0 ? this.#input.length : end + 3;
	}

	#cdata() {
		const end = this.#indexOf("]]>", this.#cursor + 9);
		const stop = end < 0 ? this.#input.length : end;
		// CDATA content is never entity-decoded - that is the whole point of it.
		this.#append({ kind: "cdata", value: this.#input.slice(this.#cursor + 9, stop) });
		this.#cursor = end < 0 ? this.#input.length : end + 3;
	}

	#doctype() {
		// Track `[...]` internal-subset depth so a `>` inside it doesn't end the
		// declaration early.
		let i = this.#cursor + 2;
		let depth = 0;
		while (i < this.#input.length) {
			const c = this.#input[i];
			if (c === "[") depth++;
			else if (c === "]") depth--;
			else if (c === ">" && depth <= 0) break;
			i++;
		}
		this.#append({ kind: "doctype", value: this.#input.slice(this.#cursor + 2, i) });
		this.#cursor = Math.min(i + 1, this.#input.length);
	}

	#pi() {
		const end = this.#indexOf("?>", this.#cursor + 2);
		const stop = end < 0 ? this.#input.length : end;
		const body = this.#input.slice(this.#cursor + 2, stop);
		const space = body.search(/\s/);
		this.#append({
			kind: "pi",
			target: space < 0 ? body : body.slice(0, space),
			value: space < 0 ? "" : body.slice(space + 1),
		});
		this.#cursor = end < 0 ? this.#input.length : end + 2;
	}

	// ---- tags ------------------------------------------------------------

	#readName(from: number): { qname: string; end: number } {
		let i = from;
		while (i < this.#input.length && !/[\s/>]/.test(this.#input[i])) i++;
		return { qname: this.#input.slice(from, i), end: i };
	}

	#openTag() {
		const start = this.#cursor;
		const { qname: rawName, end } = this.#readName(this.#cursor + 1);
		if (rawName === "") {
			this.#appendText("<");
			this.#cursor++;
			return;
		}
		const qname = this.#mode === "html" ? rawName.toLowerCase() : rawName;
		this.#cursor = end;

		const { attrs, selfClosing } = this.#attributes();

		const colon = qname.indexOf(":");
		const prefix = colon > 0 ? qname.slice(0, colon) : undefined;
		const name = colon > 0 ? qname.slice(colon + 1) : qname;

		if (this.#mode === "html") {
			// Implicit close: `<p>a<p>b`, `<li>a<li>b`, `<td>a<td>b`, ...
			while (this.#open.length > 0) {
				const top = this.#open[this.#open.length - 1];
				if (!AUTO_CLOSE[top.name]?.has(name)) break;
				this.#open.pop();
				this.#nsStack.pop();
			}
		}

		// xmlns declarations must be read *before* resolving this element's own
		// prefix, so `<w:p xmlns:w="...">` self-binds correctly.
		const frame = new Map<string, string>();
		if (this.#mode === "xml") {
			for (const [k, v] of attrs) {
				if (k === "xmlns") frame.set("", v);
				else if (k.startsWith("xmlns:")) frame.set(k.slice(6), v);
			}
		}
		this.#nsStack.push(frame);

		const el: XmlElement = {
			kind: "element",
			name,
			qname,
			attrs,
			children: [],
		};
		if (prefix) el.prefix = prefix;
		if (this.#mode === "xml") {
			// An unbound prefix is not an error - docx fragments handed over
			// without their root declarations are entirely normal.
			const ns = this.#lookupNs(prefix ?? "");
			if (ns !== undefined) el.ns = ns;
		}

		this.#append(el);

		const isVoid = this.#mode === "html" && VOID.has(name);
		if (selfClosing || isVoid) {
			el.selfClosing = true;
			this.#nsStack.pop();
			return;
		}

		this.#open.push(el);

		if (this.#mode === "html" && (RAW_TEXT.has(name) || ESCAPABLE_RAW.has(name))) {
			this.#rawTextContent(name, ESCAPABLE_RAW.has(name));
		}

		if (this.#cursor <= start) this.#cursor = start + 1; // guard against stalling
	}

	/** `<script>`/`<style>`/`<textarea>` bodies are scanned verbatim. */
	#rawTextContent(name: string, decode: boolean) {
		const lower = this.#input.toLowerCase();
		const close = lower.indexOf(`</${name}`, this.#cursor);
		const stop = close < 0 ? this.#input.length : close;
		const raw = this.#input.slice(this.#cursor, stop);
		if (raw) this.#appendText(decode ? this.#decode(raw) : raw);
		this.#cursor = stop;
	}

	#attributes(): { attrs: Map<string, string>; selfClosing: boolean } {
		const attrs = new Map<string, string>();
		let selfClosing = false;

		while (this.#cursor < this.#input.length) {
			while (/\s/.test(this.#input[this.#cursor] ?? "")) this.#cursor++;
			const ch = this.#input[this.#cursor];

			if (ch === undefined) {
				this.#error("eof-in-tag", "input ends inside a tag");
				break;
			}
			if (ch === ">") {
				this.#cursor++;
				break;
			}
			if (ch === "/" && this.#input[this.#cursor + 1] === ">") {
				selfClosing = true;
				this.#cursor += 2;
				break;
			}
			if (ch === "/") {
				this.#cursor++;
				continue;
			}

			// Attribute name
			const nameStart = this.#cursor;
			while (
				this.#cursor < this.#input.length &&
				!/[\s=/>]/.test(this.#input[this.#cursor])
			) this.#cursor++;
			if (this.#cursor === nameStart) {
				this.#cursor++; // never stall on an unexpected character
				continue;
			}
			const rawKey = this.#input.slice(nameStart, this.#cursor);
			const key = this.#mode === "html" ? rawKey.toLowerCase() : rawKey;

			while (/\s/.test(this.#input[this.#cursor] ?? "")) this.#cursor++;

			let value = "";
			if (this.#input[this.#cursor] === "=") {
				this.#cursor++;
				while (/\s/.test(this.#input[this.#cursor] ?? "")) this.#cursor++;
				const q = this.#input[this.#cursor];
				if (q === '"' || q === "'") {
					const end = this.#indexOf(q, this.#cursor + 1);
					const stop = end < 0 ? this.#input.length : end;
					value = this.#decode(this.#input.slice(this.#cursor + 1, stop));
					this.#cursor = end < 0 ? this.#input.length : end + 1;
				} else {
					// Unquoted: legal in html, malformed but recoverable in xml.
					if (this.#mode === "xml") {
						this.#error("unquoted-attr", `unquoted value for "${key}"`);
					}
					const start = this.#cursor;
					while (
						this.#cursor < this.#input.length &&
						!/[\s>]/.test(this.#input[this.#cursor])
					) this.#cursor++;
					value = this.#decode(this.#input.slice(start, this.#cursor));
				}
			} else {
				// Valueless attribute: `<input disabled>` - HTML convention is
				// that the value is the empty string, not the name.
				value = "";
			}

			// First wins, matching browsers.
			if (attrs.has(key)) this.#error("duplicate-attr", `duplicate attribute "${key}"`);
			else attrs.set(key, value);
		}

		return { attrs, selfClosing };
	}

	#closeTag() {
		const { qname: raw, end } = this.#readName(this.#cursor + 2);
		const gt = this.#indexOf(">", end);
		this.#cursor = gt < 0 ? this.#input.length : gt + 1;

		const qname = this.#mode === "html" ? raw.toLowerCase() : raw;
		const colon = qname.indexOf(":");
		const name = colon > 0 ? qname.slice(colon + 1) : qname;

		let idx = -1;
		for (let i = this.#open.length - 1; i >= 0; i--) {
			if (this.#open[i].name === name) {
				idx = i;
				break;
			}
		}

		if (idx < 0) {
			// HTML5's "any other end tag" behavior. Popping to the root instead
			// would destroy the document structure over one stray `</div>`.
			this.#error("stray-close", `</${qname}> with no matching open tag`);
			return;
		}

		for (let i = this.#open.length - 1; i > idx; i--) {
			this.#error("mismatched", `<${this.#open[i].qname}> closed by </${qname}>`);
			this.#open.pop();
			this.#nsStack.pop();
		}
		this.#open.pop();
		this.#nsStack.pop();
	}
}

/** Parses `src` as XML, returning a synthetic `#document` root. */
export function parseXml(src: string, opts: XmlParseOptions = {}): XmlElement {
	return new XmlParser(src, { ...opts, mode: opts.mode ?? "xml" }).parse();
}

/**
 * Parses `src` as HTML. A synthetic root (rather than "the single root
 * element") is required because fragments legitimately have many top-level
 * nodes.
 */
export function parseHtml(src: string, opts: Omit<XmlParseOptions, "mode"> = {}): XmlElement {
	return new XmlParser(src, { ...opts, mode: "html" }).parse();
}
