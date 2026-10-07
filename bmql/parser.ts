import type {
	CompareOp,
	FilterStep,
	Operand,
	Pipeline,
	Predicate,
	Query,
	SliceStep,
	Stage,
	Step,
} from "./types.ts";

/** Thrown for malformed query text. `offset` is the index the parser stopped at. */
export class BmqlSyntaxError extends SyntaxError {
	constructor(message: string, readonly source: string, readonly offset: number) {
		super(`${message} at ${offset}\n  ${source}\n  ${" ".repeat(offset)}^`);
		this.name = "BmqlSyntaxError";
	}
}

const IDENT = /[\p{L}\p{N}_-]/u;
const OPS: CompareOp[] = [">=", "<=", "!=", ">", "<", "~"];
const CACHE_LIMIT = 512;
const cache = new Map<string, Query>();
const pipelineCache = new Map<string, Pipeline>();

function remember<T>(map: Map<string, T>, key: string, value: T): T {
	if (map.size >= CACHE_LIMIT) map.delete(map.keys().next().value!);
	map.set(key, value);
	return value;
}

/**
 * Parses a whole query. Leading and trailing whitespace is allowed; anything
 * else left over is an error. Results are memoized by source text.
 */
export function parse(source: string): Query {
	const cached = cache.get(source);
	if (cached) return cached;

	const parser = new Parser(source);
	parser.skipSpace();
	const query = parser.query();
	parser.skipSpace();
	if (!parser.done) parser.fail(`Unexpected "${parser.at()}"`);

	return remember(cache, source, query);
}

/**
 * Parses a query followed by any number of `>>` stages. A stage that is
 * exactly one quoted string is a separator; anything else is a template, in
 * which `$` starts a query against the item and `\` escapes the next
 * character (`\>`, `\$`, `\\`, plus `\n` and `\t`). Memoized by source text.
 */
export function parsePipeline(source: string): Pipeline {
	const cached = pipelineCache.get(source);
	if (cached) return cached;
	const parser = new Parser(source);
	const pipeline = parser.pipeline();
	return remember(pipelineCache, source, { source, ...pipeline });
}

/**
 * Parses a pipeline that starts at `offset` in `source` and ends at `close`
 * (`"}}"`, say), for callers that embed pipelines in larger syntax. Braces
 * and quotes inside the pipeline are parsed rather than counted, so
 * `characters{name:Sel}}}` closes after the filter. `end` is the index after
 * `close`; `pipeline.source` is the text between the two.
 */
export function parsePipelineAt(
	source: string,
	offset: number,
	close: string,
): { pipeline: Pipeline; end: number } {
	const parser = new Parser(source, offset, close);
	parser.pipeline();
	const inner = source.slice(offset, parser.pos);
	return { pipeline: parsePipeline(inner), end: parser.pos + close.length };
}

/**
 * Parses one query starting at `offset` in `source` and stops at the first
 * character that cannot continue it (whitespace included), for callers that
 * embed queries in larger syntax. `end` is the index after the query.
 */
export function parseAt(source: string, offset: number): { query: Query; end: number } {
	const parser = new Parser(source, offset);
	const query = parser.query();
	return { query, end: parser.pos };
}

class Parser {
	pos: number;
	constructor(readonly src: string, start = 0, readonly close?: string) {
		this.pos = start;
	}

	get closed(): boolean {
		return this.close !== undefined && this.src.startsWith(this.close, this.pos);
	}

	get stageEnd(): boolean {
		return this.done || this.closed || this.src.startsWith(">>", this.pos);
	}

	pipeline(): Omit<Pipeline, "source"> {
		this.skipSpace();
		const query = this.query();
		this.skipSpace();
		const stages: Stage[] = [];
		while (this.close === undefined ? !this.done : !this.closed) {
			if (this.done) this.fail(`Expected "${this.close}"`);
			if (!this.src.startsWith(">>", this.pos)) this.fail(`Unexpected "${this.at()}"`);
			this.pos += 2;
			stages.push(this.stage());
		}
		return { query, stages };
	}

	get done(): boolean {
		return this.pos >= this.src.length;
	}

	at(): string {
		return this.src[this.pos] ?? "";
	}

	fail(message: string, at = this.pos): never {
		throw new BmqlSyntaxError(message, this.src, at);
	}

	skipSpace() {
		while (/\s/.test(this.at()) && !this.done) this.pos++;
	}

	expect(ch: string) {
		if (this.at() !== ch) this.fail(`Expected "${ch}"`);
		this.pos++;
	}

	query(): Query {
		const start = this.pos;
		const steps: Step[] = [];
		let relative = false;

		if (this.at() === "$") {
			relative = true;
			this.pos++;
		} else if (IDENT.test(this.at()) || this.at() === '"' || this.at() === "'") {
			steps.push({ kind: "key", key: this.key(), offset: start });
		}

		while (!this.done) {
			const offset = this.pos;
			if (this.at() === ".") {
				this.pos++;
				steps.push({ kind: "key", key: this.key(), offset });
			} else if (this.at() === "{") {
				steps.push(this.filter());
			} else if (this.at() === "[") {
				steps.push(this.slice());
			} else {
				break;
			}
		}

		return { source: this.src.slice(start, this.pos), relative, steps };
	}

	key(): string {
		if (this.at() === '"' || this.at() === "'") return this.quoted();
		const start = this.pos;
		while (IDENT.test(this.at())) this.pos++;
		if (this.pos === start) this.fail("Expected a key");
		return this.src.slice(start, this.pos);
	}

	quoted(): string {
		const quote = this.at();
		const start = this.pos;
		this.pos++;
		let out = "";
		while (this.at() !== quote) {
			if (this.done) this.fail("Unterminated string", start);
			if (this.at() === "\\") {
				this.pos++;
				const escaped = this.at();
				out += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
			} else {
				out += this.at();
			}
			this.pos++;
		}
		this.pos++;
		return out;
	}

	stage(): Stage {
		const offset = this.pos;
		this.skipSpace();
		if (this.at() === '"' || this.at() === "'") {
			const start = this.pos;
			const value = this.quoted();
			this.skipSpace();
			if (this.stageEnd) {
				return { kind: "separator", value, offset };
			}
			this.pos = start;
		}
		return { kind: "template", parts: this.template(), offset };
	}

	template(): (string | Query)[] {
		const parts: (string | Query)[] = [];
		let text = "";
		while (!this.stageEnd) {
			const ch = this.at();
			if (ch === "\\") {
				this.pos++;
				if (this.done) this.fail("Nothing to escape");
				const escaped = this.at();
				text += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
				this.pos++;
			} else if (ch === "$") {
				if (text) parts.push(text);
				text = "";
				parts.push(this.query());
			} else {
				text += ch;
				this.pos++;
			}
		}
		if (text) parts.push(text);

		const first = parts[0];
		if (typeof first === "string") parts[0] = first.trimStart();
		const last = parts.length - 1;
		if (typeof parts[last] === "string") parts[last] = (parts[last] as string).trimEnd();
		return parts.filter((part) => part !== "");
	}

	field(): string[] {
		const field = [this.key()];
		while (this.at() === ".") {
			this.pos++;
			field.push(this.key());
		}
		return field;
	}

	filter(): FilterStep {
		const offset = this.pos;
		this.expect("{");
		const predicates: Predicate[] = [];
		this.skipSpace();
		while (this.at() !== "}") {
			if (this.done) this.fail("Unterminated filter", offset);
			predicates.push(this.predicate());
			this.skipSpace();
			if (this.done) this.fail("Unterminated filter", offset);
			if (this.at() === ",") {
				this.pos++;
				this.skipSpace();
			} else if (this.at() !== "}") {
				this.fail('Expected "," or "}"');
			}
		}
		this.pos++;
		if (predicates.length === 0) this.fail("Empty filter", offset);
		return { kind: "filter", predicates, offset };
	}

	predicate(): Predicate {
		if (this.at() === "!") {
			this.pos++;
			return { kind: "presence", field: this.field(), negate: true };
		}
		const field = this.field();
		this.skipSpace();
		if (this.at() !== ":") return { kind: "presence", field, negate: false };
		this.pos++;
		this.skipSpace();

		let op: CompareOp = "=";
		const matched = OPS.find((candidate) => this.src.startsWith(candidate, this.pos));
		if (matched) {
			op = matched;
			this.pos += matched.length;
		} else if (this.at() === "!") {
			op = "!=";
			this.pos++;
		}
		this.skipSpace();
		return { kind: "compare", field, op, value: this.operand() };
	}

	operand(): Operand {
		if (this.at() === '"' || this.at() === "'") return { kind: "literal", value: this.quoted() };
		if (this.at() === "$") {
			this.pos++;
			const start = this.pos;
			while (IDENT.test(this.at())) this.pos++;
			if (this.pos === start) this.fail("Expected a variable name");
			return { kind: "var", name: this.src.slice(start, this.pos) };
		}
		const start = this.pos;
		while (!this.done && this.at() !== "," && this.at() !== "}") this.pos++;
		const value = this.src.slice(start, this.pos).trim();
		if (!value) this.fail("Expected a value", start);
		return { kind: "literal", value };
	}

	slice(): SliceStep {
		const offset = this.pos;
		this.expect("[");
		this.skipSpace();
		const start = this.int();
		this.skipSpace();
		if (this.src.startsWith("..", this.pos)) {
			this.pos += 2;
			this.skipSpace();
			const end = this.int();
			this.skipSpace();
			this.expect("]");
			return { kind: "slice", start, end, index: false, offset };
		}
		if (start === undefined) this.fail("Expected an index or a range");
		this.expect("]");
		return { kind: "slice", start, index: true, offset };
	}

	int(): number | undefined {
		const match = /^-?\d+/.exec(this.src.slice(this.pos));
		if (!match) return undefined;
		this.pos += match[0].length;
		return Number(match[0]);
	}
}
