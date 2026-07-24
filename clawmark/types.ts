/**
 * Core contract for the rule-based markup engine. This mirrors
 * webbies/lib/md/v2.ts as closely as possible - see the README-style notes
 * below for the handful of places this had to grow beyond that file to make
 * a working engine out of it. Fold these back into v2.ts when this graduates
 * out of graver into its own library.
 */

import type { XmlElement, XmlParseOptions } from "./xml/types.ts";

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

export interface Rule<T = Record<string, unknown>> extends ReverseRule<T> {
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

// ===========================================================================
// Reverse direction: XML/HTML -> Node tree -> markdown.
//
// These hooks are optional on `Rule`, so every rule written before they
// existed stays valid untouched. They live on the same interface rather than
// in a parallel registry so that one rule owns a construct in *both*
// directions - `md:heading` can never drift between the HTML it emits and the
// markdown it emits.
// ===========================================================================

/** How the serializer joins a node with its siblings. Defaults to "inline". */
export type SerializeKind = "block" | "inline";

/**
 * A rule that participates only in the reverse direction.
 *
 * Reverse-only rules should take ids in a `rev:` namespace. `TreeBuilder` and
 * `Renderer` key their dispatch maps on `Rule.id` and throw on an unregistered
 * *node tag*; since no node ever carries a `rev:` tag, those maps are never
 * consulted for these rules and nothing throws. That is what lets a profile
 * author write a matcher without also writing `validate`/`tokenize`/`tree`/
 * `renderOpen` stubs for a construct that has no markdown syntax of its own.
 */
export interface ReverseRule<T = Record<string, unknown>> {
	id: TokenIdentifier;

	/**
	 * Element local names this rule's `match` is registered under. `"*"` puts
	 * it in the wildcard bucket, consulted for every element - which is how
	 * docx works at all, since there every block is a `<w:p>` and the real
	 * distinction lives in the resolved style.
	 */
	matchTag?: string | string[];

	/** XML -> Node. Return null to decline; the crawler tries the next rule. */
	match?(el: XmlElement, ctx: MatchContext): MatchResult | null;

	/** Node -> markdown. Omit and the node serializes as just its children. */
	serialize?(node: Node<T>, ctx: SerializeContext): string;

	serializeKind?: SerializeKind;

	/** Suppresses whitespace collapsing inside this node (code, pre). */
	preserveWhitespace?: boolean;
}

// deno-lint-ignore no-explicit-any
export type AnyReverseRule = ReverseRule<any>;

/** Anything the engine accepts in a rule array. */
export type EngineRule = AnyRule | AnyReverseRule;

/** Narrows to a rule that can participate in lexing/tree-building/rendering. */
export function isForwardRule(rule: EngineRule): rule is AnyRule {
	return typeof (rule as AnyRule).validate === "function";
}

export type WhitespaceMode = "normal" | "pre";

export type MatchResult =
	/** Open a node, recurse into the element's children, close it. */
	| {
		kind: "wrap";
		tag: TokenIdentifier;
		data?: Record<string, unknown>;
		whitespace?: WhitespaceMode;
	}
	/** Emit a childless node; the matcher has consumed the whole subtree. */
	| { kind: "leaf"; tag: TokenIdentifier; data?: Record<string, unknown> }
	/** Emit several ready-built siblings. */
	| { kind: "nodes"; nodes: Node[] }
	/** Drop the element; keep crawling its children into the current parent. */
	| { kind: "unwrap" }
	/** Drop the element and its whole subtree. */
	| { kind: "drop" }
	/** Emit the element verbatim as an `md:raw` node. */
	| { kind: "raw" }
	/** Full control: the matcher drives its own recursion via `ctx.crawlChildren`. */
	| { kind: "custom"; run(parent: Node, ctx: MatchContext): void };

export interface MatchContext {
	readonly el: XmlElement;
	/** Root-first, excluding `el` itself. */
	readonly ancestors: readonly XmlElement[];
	readonly parent?: XmlElement;
	/**
	 * Clawmark tag of the enclosing emitted node. This is what makes
	 * blockquotes work: `<p>` inside an `md:blockquote` must become an
	 * `md:lineitem`, while `<p>` anywhere else is a `core:paragraph`.
	 */
	readonly parentTag: TokenIdentifier | undefined;

	/** Normalized, ancestor-cascaded style for `el`. Memoized. */
	readonly style: ResolvedStyle;
	styleOf(el: XmlElement): ResolvedStyle;
	readonly styleTable: StyleTable;

	/** Attribute lookup tolerant of prefix variance: `attr("val")` finds `w:val`. */
	attr(name: string, el?: XmlElement): string | undefined;
	find(localName: string, el?: XmlElement): XmlElement | undefined;
	findAll(localName: string, el?: XmlElement): XmlElement[];
	child(localName: string, el?: XmlElement): XmlElement | undefined;
	/** Flattened, whitespace-normalized, trimmed text of a subtree. */
	text(el?: XmlElement): string;

	/** Recurse into an element's children, appending under `parent`. */
	crawlChildren(parent: Node, el?: XmlElement): void;
	/** Per-document scratch space for stateful profiles. */
	readonly state: Map<string, unknown>;
	warn(message: string, el?: XmlElement): void;
}

export type UnmatchedPolicy = "unwrap" | "raw" | "drop";
export type UnmatchedHandler = (el: XmlElement, ctx: MatchContext) => MatchResult | null;

export interface CrawlOptions {
	rules?: EngineRule[];
	/** Default "unwrap". */
	unmatched?: UnmatchedPolicy | UnmatchedHandler;
	/** Keyed by element local name; overrides `unmatched`. */
	unmatchedByTag?: Record<string, UnmatchedPolicy | UnmatchedHandler>;
	styles?: StyleResolver;
	styleTable?: StyleTable;
	onWarn?(message: string, el?: XmlElement): void;
}

// ---- serialization --------------------------------------------------------

export interface SerializeOptions {
	bullet?: "-" | "*" | "+";
	emphasis?: "*" | "_";
	strong?: "**" | "__";
	/** Continuation indent per list level, in spaces. Default 2. */
	listIndent?: number;
	escape?: boolean;
	eof?: "\n" | "";
	onWarn?(message: string, node?: Node): void;
}

export interface ListFrame {
	kind: "ordered" | "unordered";
	/** 1-based index of the item currently being emitted. */
	ordinal: number;
	/** Continuation indent contributed by this level. */
	indent: string;
}

export type EscapePosition = "inline" | "lineStart" | "cell" | "linkText" | "linkDest" | "title";

export interface SerializeContext {
	readonly options: Required<Omit<SerializeOptions, "onWarn">> & Pick<SerializeOptions, "onWarn">;
	/** Innermost list frame last. Empty at top level. */
	readonly lists: readonly ListFrame[];
	withList<T>(frame: ListFrame, fn: (frame: ListFrame) => T): T;

	/** Serializes one node through its rule. */
	node(node: Node): string;
	/** Serializes a node's children, joining per each child's `serializeKind`. */
	children(node: Node): string;
	/** Flattens a subtree to plain text. */
	text(node: Node): string;

	isBlock(node: Node): boolean;
	escape(value: string, position?: EscapePosition): string;
	/** Prefixes every line; blank lines get `restBlank` so no trailing space is left. */
	prefixLines(text: string, first: string, rest: string, restBlank?: string): string;

	/** Queues a block to be emitted at document end (footnote definitions). */
	defer(key: string, block: string): void;
	readonly state: Map<string, unknown>;
	warn(message: string, node?: Node): void;
}

// ---- style resolution -----------------------------------------------------

/**
 * Normalized style, so a rule never has to know that a docx heading is
 * `<w:pPr><w:pStyle w:val="Heading1"/>` while an odt one is
 * `<text:h text:outline-level="1">`.
 */
export interface ResolvedStyle {
	/** Named style, e.g. "Heading1" / "Quote" / "T1". */
	named?: string;
	blockRole?: "heading" | "paragraph" | "quote" | "code" | "list" | "table";
	headingLevel?: number;
	bold?: boolean;
	italic?: boolean;
	strike?: boolean;
	underline?: boolean;
	mono?: boolean;
	highlight?: boolean;
	list?: {
		kind: "ordered" | "unordered" | "check";
		level: number;
		checked?: boolean;
		id?: string;
	};
	align?: "l" | "c" | "r";
	/**
	 * Format-specific escape hatch, never read by core. Deliberately a named
	 * bag rather than an index signature: an open index signature would
	 * destroy autocomplete on `whereStyle(s => s.bold)`, which is the whole
	 * ergonomic point of having a *normalized* style in the first place.
	 */
	ext?: Record<string, unknown>;
}

export interface StyleResolver {
	/** Style contributed by this element alone: direct formatting + named refs. */
	own(el: XmlElement, table: StyleTable): ResolvedStyle;
	/**
	 * Properties that inherit from an ancestor's resolved style. Defaults to
	 * character-level properties only - see `DEFAULT_INHERITS` in style.ts for
	 * why block-level properties must never cascade.
	 */
	inherits?: readonly (keyof ResolvedStyle)[];
}

export interface StyleDef {
	id: string;
	/** Human name; docx and odt both carry one distinct from the id. */
	name?: string;
	basedOn?: string;
	type?: "paragraph" | "character" | "table" | "numbering" | "list";
	style: ResolvedStyle;
}

export interface StyleTable {
	get(idOrName: string): StyleDef | undefined;
	/** Flattens a style through its `basedOn` chain. Memoized, cycle-safe. */
	resolve(idOrName: string): ResolvedStyle;
	readonly defaults: ResolvedStyle;
}

// ---- profiles -------------------------------------------------------------

/** A named bundle of reverse rules plus the style machinery they depend on. */
export interface Profile {
	name: string;
	rules: EngineRule[];
	styles?: StyleResolver;
	styleTable?: StyleTable;
	/** Prefix-to-URI map, so `on("w:p")` can become a resolved-URI predicate. */
	nsMap?: Record<string, string>;
	parse?: XmlParseOptions;
	unmatched?: UnmatchedPolicy | UnmatchedHandler;
	unmatchedByTag?: Record<string, UnmatchedPolicy | UnmatchedHandler>;
}
