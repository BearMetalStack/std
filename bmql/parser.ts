import type { CompareOp, FilterStep, Operand, Predicate, Query, SliceStep, Step } from "./types.ts";

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

	if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
	cache.set(source, query);
	return query;
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
	constructor(readonly src: string, start = 0) {
		this.pos = start;
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
