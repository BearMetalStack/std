import type { AnyRule, Char, LexerContext, Token, TokenIdentifier } from "./types.ts";
import { BOF_TOKEN } from "./types.ts";

interface OpenBlock {
	tag: TokenIdentifier;
	singleLine: boolean;
}

/**
 * Sentinel returned by `peek`/`toNextSubstring` helpers when a lookahead
 * runs past the end of input. Inherited from v1 (webbies/lib/md/lexer.ts),
 * which compares against the literal string `"eof"` all over its rule
 * bodies - kept identical here so rules ported from v1 keep working
 * unmodified.
 */
const EOF = "eof";

/**
 * Rule-driven replacement for v1's monolithic `MarkdownLexer`. v1 hardcodes
 * every construct into one big character-switch with shared mutable fields
 * (`lineEndContext`, `listStack`, `isInCodeBlock`, ...). Here, everything
 * except paragraph/blank-line handling is delegated to registered `Rule`s;
 * the only thing the engine still owns directly is:
 *
 *   1. Text buffering between tokens (a rule firing, or a newline, flushes it).
 *   2. Line tracking (`lineStart`, `currentLine`).
 *   3. The open-block stack + blank-line auto-close, which a stateful rule
 *      (blockquote, list, table, footnote def, code block) opts into via
 *      `ctx.pushBlock` instead of the engine hardcoding what block types
 *      exist. See types.ts for why this couldn't just live on a Rule.
 */
export class Lexer {
	#input: string;
	#cursor = 0;
	#lineStart = 0;
	#buffer: string[] = [];
	#tokens: Token[] = [];
	#previousToken: Token = BOF_TOKEN;
	#openBlocks: OpenBlock[] = [];
	#byTrigger = new Map<Char, AnyRule[]>();
	#rules: AnyRule[];
	#ctx: LexerContext;

	constructor(input: string, rules: AnyRule[]) {
		this.#input = input;
		this.#rules = rules;
		for (const rule of rules) {
			const list = this.#byTrigger.get(rule.trigger) ?? [];
			list.push(rule);
			this.#byTrigger.set(rule.trigger, list);
		}
		this.#ctx = this.#buildContext();
	}

	#buildContext(): LexerContext {
		// The object literal below uses `get`/`set` accessors, which have
		// their own `this` (the LexerContext instance) - `self` is how they
		// reach back into the Lexer's own private fields.
		// deno-lint-ignore no-this-alias
		const self = this;
		return {
			peek: (length, offset = 0) => self.#peek(length, offset),
			toNextSubstring: (sub, offset = 0) => self.#toNextSubstring(sub, offset),
			get rules() {
				return self.#rules;
			},
			get lineStart() {
				return self.#lineStart;
			},
			get cursor() {
				return self.#cursor;
			},
			set cursor(value: number) {
				self.#cursor = value;
			},
			get currentLine() {
				return self.#currentLine();
			},
			get previousToken() {
				return self.#previousToken;
			},
			pushBlock: (tag, options) => {
				self.#openBlocks.push({ tag, singleLine: options?.singleLine ?? false });
			},
			popBlock: () => self.#openBlocks.pop()?.tag,
			get currentBlock() {
				return self.#openBlocks[self.#openBlocks.length - 1]?.tag;
			},
			get blockDepth() {
				return self.#openBlocks.length;
			},
			discardBuffer: () => {
				self.#buffer = [];
			},
		};
	}

	#peek(length: number, offset = 0): string {
		if (this.#cursor + offset + length > this.#input.length) return EOF;
		return this.#input.slice(this.#cursor + offset, this.#cursor + offset + length);
	}

	#toNextSubstring(sub: string, offset = 0): string {
		const start = this.#cursor + offset;
		const i = this.#input.indexOf(sub, start);
		if (i < 0) return "";
		return this.#input.slice(start, i + sub.length);
	}

	#currentLine(): string {
		const lineEnd = this.#input.indexOf("\n", this.#cursor);
		return this.#input.slice(this.#lineStart, lineEnd < 0 ? this.#input.length : lineEnd);
	}

	#emit(token: Token) {
		this.#tokens.push(token);
		this.#previousToken = token;
	}

	#flush() {
		if (this.#buffer.length === 0) return;
		this.#emit({ tag: "core:text", data: { value: this.#buffer.join("") } });
		this.#buffer = [];
	}

	#matchRule(ch: Char): AnyRule | undefined {
		const candidates = this.#byTrigger.get(ch);
		if (!candidates) return undefined;
		for (const rule of candidates) {
			if (rule.validate(this.#ctx)) return rule;
		}
		return undefined;
	}

	/**
	 * Mirrors v1's `case "\n":` block. A single newline inside a paragraph
	 * collapses to a soft space; a blank line (or EOF) closes whatever
	 * blocks are open plus the paragraph, then reopens a fresh paragraph.
	 * Single-line blocks (headings) close on *every* newline, blank or not.
	 */
	#handleNewline() {
		this.#lineStart = this.#cursor + 1;
		this.#flush();

		const top = this.#openBlocks[this.#openBlocks.length - 1];
		if (top?.singleLine) {
			this.#openBlocks.pop();
			this.#emit({ tag: top.tag, data: { phase: "close" } });
		}

		const next2 = this.#peek(2);
		if (next2 === "\n\n" || next2 === EOF) {
			while (this.#openBlocks.length > 0) {
				const block = this.#openBlocks.pop()!;
				this.#emit({ tag: block.tag, data: { phase: "close" } });
			}
			this.#emit({ tag: "core:paragraph", data: { phase: "close" } });
			this.#cursor++;
			this.#lineStart++;
			if (this.#peek(2) !== EOF) {
				this.#emit({ tag: "core:paragraph", data: { phase: "open" } });
			}
		} else if (this.#openBlocks.length === 0 && /^\n[^\n]/.test(next2)) {
			// Soft-wrap only applies to plain paragraph text. Inside a
			// multi-line block (blockquote, list, table, ...) each line has
			// its own marker rule that decides what happens next, so
			// inserting a space here would just leak into whatever that
			// line's content ends up being.
			this.#buffer.push(" ");
		}
	}

	tokenize(): Token[] {
		this.#emit({ tag: "core:paragraph", data: { phase: "open" } });

		while (this.#cursor < this.#input.length) {
			const ch = this.#input[this.#cursor];
			if (ch === "\n") {
				this.#handleNewline();
			} else {
				const rule = this.#matchRule(ch);
				if (rule) {
					this.#flush();
					const result = rule.tokenize(this.#ctx);
					for (const token of Array.isArray(result) ? result : [result]) {
						this.#emit(token);
					}
				} else {
					this.#buffer.push(ch);
				}
			}
			this.#cursor++;
		}

		// v1 never does this final cleanup pass, so a document that doesn't
		// end in a blank line leaves its trailing blocks structurally open
		// on the tree builder's stack forever. Harmless for a single
		// top-level parse, but closing everything explicitly here is more
		// correct and costs nothing.
		this.#flush();
		while (this.#openBlocks.length > 0) {
			const block = this.#openBlocks.pop()!;
			this.#emit({ tag: block.tag, data: { phase: "close" } });
		}
		this.#emit({ tag: "core:paragraph", data: { phase: "close" } });

		return this.#tokens;
	}
}
