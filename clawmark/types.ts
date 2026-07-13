/**
 * Core contract for the rule-based markup engine. This mirrors
 * webbies/lib/md/v2.ts as closely as possible - see the README-style notes
 * below for the handful of places this had to grow beyond that file to make
 * a working engine out of it. Fold these back into v2.ts when this graduates
 * out of graver into its own library.
 */

export type Namespace = string;
export type Identifier = string;
export type TokenIdentifier = `${Namespace}:${Identifier}`;
export type Char = string;

export interface Token<T = Record<string, unknown>> {
	tag: TokenIdentifier;
	data: T;
}

export interface Node<T = Record<string, unknown>> {
	tag: TokenIdentifier;
	data: T;
	children: Node[];
	parent?: Node;
}

/**
 * Passed to `Rule.validate` / `Rule.tokenize`. Matches v2.ts's LexerContext
 * exactly for `peek`, `toNextSubstring`, `lineStart`, `cursor`,
 * `currentLine`, and `previousToken`.
 *
 * Extension beyond v2.ts: `pushBlock` / `popBlock` / `currentBlock` /
 * `blockDepth`. v1 (webbies/lib/md/lexer.ts) leans on a private
 * `lineEndContext` field plus a hand-written `listStack` to know what
 * multi-line block is currently open, so it knows what to auto-close on a
 * blank line (or, for headings, on *any* newline). A rule-based engine can't
 * hardcode "what block types exist" the way v1 does - so instead a rule that
 * opens a multi-line block (blockquote, list, table, footnote def, code
 * block) registers itself on this stack, and the core lexer's newline
 * handling closes the top of the stack without needing to know what it is.
 */
export interface LexerContext {
	peek(length: number, offset?: number): string;
	toNextSubstring(sub: string, offset?: number): string;
	readonly lineStart: number;
	cursor: number;
	readonly currentLine: string;
	readonly previousToken: Token;

	pushBlock(tag: TokenIdentifier, options?: { singleLine?: boolean }): void;
	popBlock(): TokenIdentifier | undefined;
	readonly currentBlock: TokenIdentifier | undefined;
	readonly blockDepth: number;

	/**
	 * Extension beyond v2.ts, used by exactly one rule (ordered lists).
	 * v1's ordered-list marker is recognized *after the fact*: digits get
	 * buffered as plain text char-by-char, and only once the following `.`
	 * arrives does v1 realize "that was a list marker" and throws the
	 * buffered digits away (`this.buffer = []`) instead of flushing them as
	 * text. The core lexer always flushes the buffer right before a rule's
	 * `tokenize` runs, so a rule that needs the discard-not-flush behavior
	 * has to pre-empt that by calling this from inside `validate` (the only
	 * hook that runs before the automatic flush).
	 */
	discardBuffer(): void;
}

/**
 * Passed to `Rule.tree`. Matches v2.ts's TreeContext exactly: just the raw
 * stack and a convenience getter for its top. Rules are free to push/pop the
 * stack directly - see rules/helpers.ts for small free functions that wrap
 * the common open/close/append-leaf patterns so individual rules don't all
 * reimplement the same three lines. Those are plain helper functions, not
 * additions to this interface, so anything satisfying the minimal
 * `{ stack, currentNode }` shape still works.
 */
export interface TreeContext {
	readonly stack: Node[];
	readonly currentNode: Node;
}

export type RenderMethod = "html" | "dom";

/** Matches v2.ts's RenderContext exactly. */
export interface RenderContext {
	renderMethod: RenderMethod;
}

export interface Rule<T = Record<string, unknown>> {
	id: TokenIdentifier;
	/** Rule interop - not implemented yet, kept for shape-compatibility with v2.ts. */
	requires?: TokenIdentifier[];
	overrides?: TokenIdentifier[];
	trigger: Char;
	validate(ctx: LexerContext): boolean;
	tokenize(ctx: LexerContext): Token<T> | Token<T>[];
	tree(token: Token<T>, ctx: TreeContext): void;
	renderOpen(node: Node<T>, ctx: RenderContext): string;
	renderClose?(node: Node<T>, ctx: RenderContext): string;
}

/**
 * The engine has to hold a heterogeneous set of rules (each with its own
 * `T`) in one array. `AnyRule` is that erased form - individual rule
 * modules should still export their `Rule<SomeSpecificT>` for their own
 * internal type-safety and just widen at the registration boundary.
 */
// deno-lint-ignore no-explicit-any
export type AnyRule = Rule<any>;
export type RuleFactory = () => AnyRule;

export const ROOT_TAG: TokenIdentifier = "core:root";
export const BOF_TOKEN: Token = { tag: "core:bof", data: {} };
