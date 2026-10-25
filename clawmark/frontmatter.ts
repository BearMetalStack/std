/**
 * @module
 * Frontmatter: a YAML block fenced by `---` lines at the very top of a document.
 *
 * The YAML is a deliberate subset, parsed with no dependencies: block mappings and sequences
 * nested by indentation, flow `[a, b]` and `{a: 1}` collections, quoted and bare scalars,
 * booleans, numbers, null, and `|`/`>` block scalars. Anchors, tags, multi-document streams and
 * complex keys are not supported and throw {@linkcode FrontmatterError} with the offending line,
 * rather than being misread.
 *
 * Numbers follow YAML: `version: 0.10` reads as `0.1`. Quote anything that only looks numeric.
 *
 * ```ts
 * const { data, body } = splitFrontmatter("---\ntitle: Hello\n---\n# Body");
 * data.title; // "Hello"
 * ```
 */

import type { Node, StagedRule } from "./types.ts";
import { defaultRules } from "./rules/mod.ts";
import { parse } from "./mod.ts";

/** A YAML value the subset can produce. */
export type YamlValue = string | number | boolean | null | YamlValue[] | {
	[key: string]: YamlValue;
};

/** Thrown for YAML outside the supported subset, or malformed YAML. `line` is 1-based within the frontmatter. */
export class FrontmatterError extends Error {
	constructor(message: string, readonly line: number) {
		super(`frontmatter line ${line}: ${message}`);
		this.name = "FrontmatterError";
	}
}

/** What {@linkcode splitFrontmatter} returns. */
export interface Frontmatter<T = Record<string, YamlValue>> {
	/** The parsed block, or `{}` when the document has none. */
	data: T;
	/** The document after the closing fence. */
	body: string;
	/** The YAML text between the fences, or `null` when the document has none. */
	raw: string | null;
}

const FENCE = /^﻿?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Separates a leading `---` block from the rest of the document and parses it. A document without
 * one comes back whole, with empty `data`. The block must be a mapping.
 */
export function splitFrontmatter<T = Record<string, YamlValue>>(source: string): Frontmatter<T> {
	const m = FENCE.exec(source);
	if (!m) return { data: {} as T, body: source, raw: null };
	const raw = m[1] ?? "";
	const value = parseYaml(raw);
	if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
		throw new FrontmatterError("frontmatter must be a mapping of keys to values", 1);
	}
	return { data: (value ?? {}) as T, body: source.slice(m[0].length), raw };
}

/** Puts `data` back on top of `body` as a fenced block. Empty `data` writes no block at all. */
export function stringifyFrontmatter(data: Record<string, YamlValue>, body: string): string {
	if (!Object.keys(data).length) return body;
	return `---\n${stringifyYaml(data)}---\n${body}`;
}

/** {@linkcode splitFrontmatter} and {@linkcode parse} in one: the frontmatter and the body's tree. */
export function parseDocument<T = Record<string, YamlValue>>(
	source: string,
	rules: StagedRule[] = defaultRules(),
): { frontmatter: T; tree: Node } {
	const { data, body } = splitFrontmatter<T>(source);
	return { frontmatter: data, tree: parse(body, rules) };
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

interface Line {
	indent: number;
	text: string;
	/** 1-based. */
	no: number;
	/** The untouched line, for block scalars. */
	raw: string;
}

/** Parses the YAML subset described in the module docs. Empty input is `null`. */
export function parseYaml(text: string): YamlValue {
	const raw = text.replace(/\r/g, "").split("\n");
	const lines: Line[] = raw.map((r, i) => {
		if (/^\s*\t/.test(r)) throw new FrontmatterError("tabs are not allowed for indentation", i + 1);
		const indent = r.length - r.trimStart().length;
		return { indent, text: stripComment(r.trim()), no: i + 1, raw: r };
	});
	const parser = new Parser(lines);
	const value = parser.block(0);
	parser.expectEnd();
	return value;
}

function stripComment(text: string): string {
	if (text.startsWith("#")) return "";
	let quote: string | null = null;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			if (ch === "\\" && quote === '"') i++;
			else if (ch === quote) quote = null;
		} else if (ch === '"' || ch === "'") quote = ch;
		else if (ch === "#" && /\s/.test(text[i - 1] ?? "")) return text.slice(0, i).trimEnd();
	}
	return text;
}

class Parser {
	#i = 0;
	constructor(readonly lines: Line[]) {}

	#skipBlank() {
		while (this.#i < this.lines.length && this.lines[this.#i].text === "") this.#i++;
	}

	#peek(): Line | undefined {
		this.#skipBlank();
		return this.lines[this.#i];
	}

	expectEnd() {
		const line = this.#peek();
		if (line) {
			throw new FrontmatterError(`unexpected indentation or content "${line.text}"`, line.no);
		}
	}

	/** A block whose lines sit at exactly `indent`. */
	block(indent: number): YamlValue {
		const line = this.#peek();
		if (!line) return null;
		if (line.indent !== indent) {
			throw new FrontmatterError(
				`expected indentation of ${indent}, found ${line.indent}`,
				line.no,
			);
		}
		if (/^([%&*!]|\? )/.test(line.text) || line.text.startsWith("---")) {
			throw new FrontmatterError(`"${line.text}" uses YAML outside the supported subset`, line.no);
		}
		return isSeqItem(line.text) ? this.#sequence(indent) : this.#mapping(indent);
	}

	#sequence(indent: number): YamlValue[] {
		const out: YamlValue[] = [];
		for (let line = this.#peek(); line && line.indent === indent; line = this.#peek()) {
			// A list under a key may share the key's indentation; the next key ends it.
			if (!isSeqItem(line.text)) break;
			const rest = line.text.slice(1).trimStart();
			if (rest === "") {
				this.#i++;
				out.push(this.#nested(indent));
			} else if (isMapEntry(rest)) {
				// `- key: value` opens a mapping whose keys sit two columns in.
				const offset = line.raw.indexOf(rest, line.indent);
				this.lines[this.#i] = { ...line, indent: offset, text: rest };
				out.push(this.#mapping(offset));
			} else {
				this.#i++;
				out.push(this.#inlineValue(rest, line, indent));
			}
		}
		return out;
	}

	#mapping(indent: number): { [key: string]: YamlValue } {
		const out: { [key: string]: YamlValue } = {};
		for (let line = this.#peek(); line && line.indent === indent; line = this.#peek()) {
			if (isSeqItem(line.text)) {
				throw new FrontmatterError("a list cannot be mixed with keys at the same level", line.no);
			}
			const entry = splitEntry(line);
			if (entry.key in out) throw new FrontmatterError(`duplicate key "${entry.key}"`, line.no);
			this.#i++;
			out[entry.key] = entry.value === ""
				? this.#nested(indent, true)
				: this.#inlineValue(entry.value, line, indent);
		}
		return out;
	}

	/** The block under a key or dash with nothing after it, or null when there is none. */
	#nested(parent: number, allowSameIndentSeq = false): YamlValue {
		const next = this.#peek();
		if (!next) return null;
		if (next.indent > parent) return this.block(next.indent);
		// YAML lets a list under a key sit at the key's own indentation.
		if (allowSameIndentSeq && next.indent === parent && isSeqItem(next.text)) {
			return this.#sequence(parent);
		}
		return null;
	}

	#inlineValue(text: string, line: Line, indent: number): YamlValue {
		const block = /^([|>])([+-]?)$/.exec(text);
		if (block) return this.#blockScalar(block[1] as "|" | ">", block[2], indent);
		return parseFlow(text, line.no);
	}

	#blockScalar(style: "|" | ">", chomp: string, parent: number): string {
		const collected: string[] = [];
		let blockIndent = -1;
		while (this.#i < this.lines.length) {
			const line = this.lines[this.#i];
			const blank = line.raw.trim() === "";
			if (!blank && line.indent <= parent) break;
			if (!blank && blockIndent < 0) blockIndent = line.indent;
			collected.push(blank ? "" : line.raw.slice(blockIndent));
			this.#i++;
		}
		let trailing = 0;
		while (collected.length && collected[collected.length - 1] === "") {
			collected.pop();
			trailing++;
		}
		let body: string;
		if (style === "|") body = collected.join("\n");
		else {
			body = "";
			for (let j = 0; j < collected.length; j++) {
				const cur = collected[j];
				if (j === 0) body = cur;
				else if (cur === "") body += "\n";
				else body += body.endsWith("\n") || body === "" ? cur : ` ${cur}`;
			}
		}
		if (chomp === "-") return body;
		if (chomp === "+") return body + "\n".repeat(trailing + 1);
		return body === "" ? "" : `${body}\n`;
	}
}

function isSeqItem(text: string): boolean {
	return text === "-" || text.startsWith("- ");
}

function isMapEntry(text: string): boolean {
	try {
		splitEntry({ text, indent: 0, no: 0, raw: text });
		return true;
	} catch {
		return false;
	}
}

function splitEntry(line: Line): { key: string; value: string } {
	const text = line.text;
	if (text[0] === '"' || text[0] === "'") {
		const end = closingQuote(text, 0);
		if (end < 0 || text[end + 1] !== ":") {
			throw new FrontmatterError(`expected "key: value", found "${text}"`, line.no);
		}
		return {
			key: String(parseScalar(text.slice(0, end + 1), line.no)),
			value: text.slice(end + 2).trim(),
		};
	}
	const m = /^([^:#[\]{},]+?)\s*:(?:\s+(.*)|$)/.exec(text);
	if (!m) throw new FrontmatterError(`expected "key: value", found "${text}"`, line.no);
	return { key: m[1], value: (m[2] ?? "").trim() };
}

function closingQuote(text: string, start: number): number {
	const q = text[start];
	for (let i = start + 1; i < text.length; i++) {
		if (q === '"' && text[i] === "\\") i++;
		else if (text[i] === q) {
			if (q === "'" && text[i + 1] === "'") i++;
			else return i;
		}
	}
	return -1;
}

/** A value on one line: a flow collection or a scalar. */
function parseFlow(text: string, no: number): YamlValue {
	const t = text.trim();
	if (t.startsWith("[")) {
		if (!t.endsWith("]")) throw new FrontmatterError(`unclosed "[" in "${t}"`, no);
		return splitFlow(t.slice(1, -1), no).map((part) => parseFlow(part, no));
	}
	if (t.startsWith("{")) {
		if (!t.endsWith("}")) throw new FrontmatterError(`unclosed "{" in "${t}"`, no);
		const out: { [key: string]: YamlValue } = {};
		for (const part of splitFlow(t.slice(1, -1), no)) {
			const { key, value } = splitEntry({ text: part, indent: 0, no, raw: part });
			out[key] = value === "" ? null : parseFlow(value, no);
		}
		return out;
	}
	return parseScalar(t, no);
}

function splitFlow(inner: string, no: number): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		if (ch === '"' || ch === "'") {
			const end = closingQuote(inner, i);
			if (end < 0) throw new FrontmatterError(`unclosed quote in "${inner}"`, no);
			i = end;
		} else if (ch === "[" || ch === "{") depth++;
		else if (ch === "]" || ch === "}") depth--;
		else if (ch === "," && depth === 0) {
			parts.push(inner.slice(start, i).trim());
			start = i + 1;
		}
	}
	const last = inner.slice(start).trim();
	if (last !== "" || parts.length) parts.push(last);
	return parts.filter((p, i) => p !== "" || i < parts.length - 1);
}

function parseScalar(text: string, no: number): YamlValue {
	if (text.startsWith('"')) {
		if (closingQuote(text, 0) !== text.length - 1) {
			throw new FrontmatterError(`unterminated or trailing text after string ${text}`, no);
		}
		return text.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e: string) => {
			if (e[0] === "u") return String.fromCharCode(parseInt(e.slice(1), 16));
			return ({ n: "\n", t: "\t", r: "\r", "0": "\0" } as Record<string, string>)[e] ?? e;
		});
	}
	if (text.startsWith("'")) {
		if (closingQuote(text, 0) !== text.length - 1) {
			throw new FrontmatterError(`unterminated or trailing text after string ${text}`, no);
		}
		return text.slice(1, -1).replaceAll("''", "'");
	}
	if (text === "" || text === "~" || text === "null" || text === "Null" || text === "NULL") {
		return null;
	}
	if (/^(true|True|TRUE)$/.test(text)) return true;
	if (/^(false|False|FALSE)$/.test(text)) return false;
	if (/^[-+]?(0|[1-9][0-9_]*)$/.test(text)) return Number(text.replaceAll("_", ""));
	if (/^[-+]?(0|[1-9][0-9]*)?\.[0-9]+([eE][-+]?[0-9]+)?$|^[-+]?[0-9]+[eE][-+]?[0-9]+$/.test(text)) {
		return Number(text);
	}
	if (/^[&*!%@`]/.test(text)) {
		throw new FrontmatterError(`"${text}" uses YAML outside the supported subset`, no);
	}
	return text;
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/** Writes `value` in the same subset {@linkcode parseYaml} reads, so the two round-trip. */
export function stringifyYaml(value: YamlValue, indent = 0): string {
	const pad = " ".repeat(indent);
	if (Array.isArray(value)) {
		if (!value.length) return `${pad}[]\n`;
		return value.map((item) => {
			if (isCollection(item) && !isEmpty(item)) {
				const inner = stringifyYaml(item, indent + 2);
				return `${pad}- ${inner.slice(indent + 2)}`;
			}
			return `${pad}- ${scalar(item)}\n`;
		}).join("");
	}
	if (value !== null && typeof value === "object") {
		return Object.entries(value).map(([k, v]) => {
			const key = /^[A-Za-z_][\w-]*$/.test(k) ? k : JSON.stringify(k);
			if (isCollection(v) && !isEmpty(v)) return `${pad}${key}:\n${stringifyYaml(v, indent + 2)}`;
			if (typeof v === "string" && v.includes("\n")) {
				const body = v.endsWith("\n") ? v.slice(0, -1) : v;
				const chomp = v.endsWith("\n") ? "" : "-";
				return `${pad}${key}: |${chomp}\n${
					body.split("\n").map((l) => (l ? `${pad}  ${l}` : "")).join("\n")
				}\n`;
			}
			return `${pad}${key}: ${scalar(v)}\n`;
		}).join("");
	}
	return `${pad}${scalar(value)}\n`;
}

function isCollection(v: YamlValue): v is YamlValue[] | { [key: string]: YamlValue } {
	return v !== null && typeof v === "object";
}

function isEmpty(v: YamlValue[] | { [key: string]: YamlValue }): boolean {
	return Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0;
}

function scalar(v: YamlValue): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return "[]";
	if (typeof v === "object") return "{}";
	if (typeof v !== "string") return String(v);
	const plain = v !== "" && v.trim() === v && parseScalar(v, 0) === v &&
		!/^[-?:,[\]{}#&*!|>'"%@`]|: | #|^-$/.test(v);
	return plain ? v : JSON.stringify(v);
}
