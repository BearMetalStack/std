/**
 * Core contract for the rule-based markup engine. This mirrors
 * webbies/lib/md/v2.ts as closely as possible - see the README-style notes
 * below for the handful of places this had to grow beyond that file to make
 * a working engine out of it. Fold these back into v2.ts when this graduates
 * out of graver into its own library.
 */

import type {
	AttrMap,
	SerializeMode,
	XmlElement,
	XmlNode,
	XmlParseOptions,
	XmlText,
} from "./xml/types.ts";

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
	 * Extension beyond v2.ts, used by link/image/table-cell parsing.
	 *
	 * Those constructs resolve their inner content (link text, a table cell)
	 * in one `tokenize()` call via a regex or a line split, rather than by
	 * staying open on the tree-builder's stack while the lexer's own
	 * per-character loop keeps running - so nothing inside them ever gets a
	 * chance to be recognized as its own construct (an emphasis run, an
	 * image, another link). Exposing the active rule set lets a `tokenize()`
	 * hand that inner text to a fresh `Lexer`/`TreeBuilder` pair and get back
	 * real child nodes instead of an opaque string. See
	 * `rules/helpers.ts`'s `parseInline`/`inlineOnly`.
	 */
	readonly rules: readonly AnyRule[];

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
	/**
	 * Open a node, recurse into the element's children, close it. An array of
	 * tags opens a nested chain, outermost first, and recurses into the
	 * innermost - one element can carry several formattings at once (an odt
	 * span that is bold *and* underlined), and a single wrap tag would force
	 * every profile to hand-build that nesting via `custom`. `data` lands on
	 * the outermost node.
	 */
	| {
		kind: "wrap";
		tag: TokenIdentifier | TokenIdentifier[];
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
	/** Verbatim text of a subtree, with no whitespace collapsing (`<pre>`). */
	raw(el?: XmlElement): string;

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
	/**
	 * Serialization mode for the `raw` policy. Defaults to "xml"; an html
	 * profile wants "html" so void elements stay void instead of gaining a
	 * closing tag.
	 */
	mode?: "xml" | "html";
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
 * A forced break. `"page"` and `"column"` are the two every target format can
 * express; anything more exotic belongs in `ResolvedStyle.ext`.
 */
export type BreakKind = "page" | "column";

/**
 * Normalized style, so a rule never has to know that a docx heading is
 * `<w:pPr><w:pStyle w:val="Heading1"/>` while an odt one is
 * `<text:h text:outline-level="1">`.
 */
export interface ResolvedStyle {
	/** Named style, e.g. "Heading1" / "Quote" / "T1". */
	named?: string;
	/**
	 * Named *character* style, e.g. "Hyperlink" / "Thought".
	 *
	 * Separate from `named` because the two coexist on one run: a `<w:r>` inside
	 * a `Quote` paragraph can carry `<w:rStyle w:val="Emphasis"/>` at the same
	 * time. Folding both into `named` would let an inline style silently
	 * overwrite the block style it sits inside.
	 */
	charStyle?: string;
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
	/** Horizontal alignment: left, center, right, justified. */
	align?: "l" | "c" | "r" | "j";
	/**
	 * Forced break before/after the block this style applies to.
	 *
	 * Normalized because the formats disagree completely on what a break even
	 * *is*: ODF spells it as an `fo:break-before` property on an automatic
	 * paragraph style, docx as either `<w:pageBreakBefore/>` in `<w:pPr>` or a
	 * `<w:br w:type="page"/>` run, HTML as a CSS `break-before`. A rule that had
	 * to know which would be a rule that only works in one format.
	 */
	breakBefore?: BreakKind;
	breakAfter?: BreakKind;
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

// ===========================================================================
// Document styles: the caller's own formatting, applied document-wide.
//
// `ResolvedStyle` is deliberately small - it is what *rules match on*, and an
// open property bag would destroy the ergonomics of `whereStyle(s => s.bold)`.
// Typography does not belong in it.
//
// So rich formatting lives in a separate registry keyed by style *name*, and
// `ResolvedStyle.named` / `charStyle` is the link between the two. A writer
// reads the name off the node, looks the block up here, and spells it in its
// own format - one registry, three target vocabularies, no per-format code on
// the caller's side.
// ===========================================================================

/**
 * A CSS length, kept as text.
 *
 * Stored verbatim rather than parsed to a number because the target formats
 * disagree on what they can express: HTML wants `1.5em` to *stay* relative,
 * while docx twips and ODF `fo:` lengths have no relative form at all and have
 * to be resolved against a base font size. Normalizing on the way in would
 * throw away the information HTML needs.
 */
export type CssLength = string;

/** Which of a format's two style vocabularies a block belongs to. */
export type BlockFamily = "paragraph" | "text";

/**
 * One named style's formatting, in a vocabulary every target can express.
 *
 * Every property here maps to all three of CSS, WordprocessingML, and ODF.
 * Anything that does not belongs in `css`, which reaches the HTML output only.
 */
export interface StyleBlock {
	/** Human-facing name. Defaults to the key it was registered under. */
	displayName?: string;
	/** Paragraph (block) or text (inline) style. Default "paragraph". */
	family?: BlockFamily;
	/** Inherits every unset property from another registered style. */
	basedOn?: string;
	/** Style applied to the paragraph *following* this one. */
	nextStyle?: string;
	/** CSS class the html writer emits. Default: kebab-case of the name. */
	className?: string;
	/** HTML element the html writer wraps this style in. Default from `role`. */
	element?: string;
	/**
	 * Normalized role, so the readers and the built-in matchers recognize a
	 * custom style as a heading/quote/code block rather than a bare paragraph.
	 */
	role?: ResolvedStyle["blockRole"];
	headingLevel?: number;

	// ---- character ---------------------------------------------------------
	fontFamily?: string;
	fontSize?: CssLength;
	fontWeight?: "normal" | "bold" | number;
	fontStyle?: "normal" | "italic";
	color?: string;
	background?: string;
	smallCaps?: boolean;
	textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
	letterSpacing?: CssLength;
	underline?: boolean;
	strike?: boolean;

	// ---- paragraph ---------------------------------------------------------
	align?: ResolvedStyle["align"];
	/** A unitless multiple (`1.5`) or a length (`18pt`). */
	lineHeight?: CssLength | number;
	spaceBefore?: CssLength;
	spaceAfter?: CssLength;
	indentLeft?: CssLength;
	indentRight?: CssLength;
	/** First-line indent. Negative values become a hanging indent. */
	textIndent?: CssLength;
	breakBefore?: BreakKind;
	breakAfter?: BreakKind;
	keepWithNext?: boolean;
	keepTogether?: boolean;
	widowControl?: boolean;

	/**
	 * Declarations no office format can express, passed through to CSS output
	 * verbatim. The `ResolvedStyle.ext` of this interface.
	 */
	css?: Record<string, string>;
}

export interface DocumentStylesOptions {
	/**
	 * Font size that `em`/`rem`/`%` resolve against when converting to docx and
	 * ODF, which have no relative lengths. Default "12pt".
	 */
	baseFontSize?: CssLength;
	onWarn?(message: string): void;
}

/**
 * A caller-supplied set of named styles, plus the bindings that attach them to
 * node tags.
 *
 * Every method that registers something returns `this`, so a whole document's
 * styling reads as one expression.
 */
export interface DocumentStyles {
	define(name: string, block: StyleBlock): DocumentStyles;
	defineAll(blocks: Record<string, StyleBlock>): DocumentStyles;
	/** Parses the supported CSS subset; each `.foo` rule becomes a style. */
	fromCss(source: string): DocumentStyles;
	/**
	 * Binds a node tag to a style name - how a custom rule declares its look
	 * without writing an emitter per format. A node may override the binding
	 * with a `style` key in its own `data`.
	 */
	bind(tag: TokenIdentifier, name: string): DocumentStyles;

	get(name: string): StyleBlock | undefined;
	/** Flattened through `basedOn`. Memoized and cycle-guarded. */
	resolve(name: string): StyleBlock;
	/** The style name a node should use, or undefined if it has none. */
	nameFor(node: Node): string | undefined;
	/** Style id for the office formats: `"Scene Break"` -> `"SceneBreak"`. */
	idFor(name: string): string;
	/** CSS class for the html writer: `"Scene Break"` -> `"scene-break"`. */
	classFor(name: string): string;
	/** Registered styles in definition order. */
	readonly entries: readonly (readonly [string, StyleBlock])[];
	readonly options: Required<Omit<DocumentStylesOptions, "onWarn">>;
	/**
	 * A `StyleTable` view of the registry, so a *read* profile resolves the same
	 * names back to the same normalized roles a writer used.
	 */
	table(): StyleTable;
}

// ---- profiles -------------------------------------------------------------

/**
 * A named bundle of reverse rules plus the style machinery they depend on.
 *
 * This is the **read** half of a format. Its write counterpart is
 * `WriteProfile`; the two are deliberately separate objects because their
 * inputs have nothing in common - a reader is configured with the source parts
 * it was handed, a writer with how the output should look.
 */
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

// ===========================================================================
// Write direction: Node tree -> markup.
//
// The third direction. Forward rendering (`Rule.renderOpen`) hardcodes HTML
// strings and takes no format parameter, so there was no slot a docx or odt
// writer could occupy. Rather than widen the `Rule` contract - which would
// break every rule ever written and force each one to know about every output
// format - the write direction is owned by the *profile*, exactly as the
// read direction's matchers are.
//
// An `Emitter` claims a node tag the way a `ReverseRule` claims an element
// name. Precedence is array position, memoized per tag, same as everywhere
// else in clawmark.
// ===========================================================================

/** A node tag an emitter registers under, or the wildcard bucket. */
export type EmitTag = TokenIdentifier | "*";

/** Node -> markup, for one output format. */
export interface Emitter<T = Record<string, unknown>> {
	/**
	 * Node tags this emitter is registered under. `"*"` puts it in the wildcard
	 * bucket, consulted for every node - which is how the office writers handle
	 * `core:text`, since the run it belongs in depends on the accumulated style
	 * rather than on the node itself.
	 */
	tag: EmitTag | EmitTag[];
	/** Overridable id, for readable debugging. Defaults to `out:<tags>-<n>`. */
	id?: string;
	/** Return null to decline; the writer tries the next emitter. */
	emit(node: Node<T>, ctx: EmitContext): EmitResult | null;
}

// deno-lint-ignore no-explicit-any
export type AnyEmitter = Emitter<any>;

export type EmitResult =
	/**
	 * Emit `el` into the current parent and emit the node's children into
	 * `into`, which defaults to `el` itself.
	 *
	 * `into` is not a convenience. Office elements are chains whose children
	 * belong at the bottom, not the top: a docx paragraph is
	 * `<w:p><w:pPr>...</w:pPr>` with the content *after* the properties, and an
	 * odt list item is `<text:list-item><text:p>`. Without it every such
	 * emitter would have to fall through to `custom` and drive its own
	 * recursion.
	 */
	| { kind: "element"; el: XmlElement; into?: XmlElement }
	/** Emit ready-built markup; the node's children are the emitter's problem. */
	| { kind: "nodes"; nodes: XmlNode[] }
	/**
	 * No element of its own: emit the node's children under an extra style
	 * frame. This is what flattens the tree's nesting into the office formats'
	 * flatness - see `EmitContext.style`.
	 */
	| { kind: "style"; style: ResolvedStyle }
	/** Emit only the node's children, into the current parent. */
	| { kind: "unwrap" }
	/** Emit nothing, dropping the whole subtree. */
	| { kind: "drop" }
	/** Full control: the emitter drives its own recursion via `ctx.children`. */
	| { kind: "custom"; run(parent: XmlElement, ctx: EmitContext): void };

/** What to do with a node tag no emitter claimed. */
export type UnclaimedPolicy =
	/** Emit the node's children into the current parent. The default. */
	| "unwrap"
	/** Emit nothing. */
	| "drop"
	/** Flatten the subtree to a single text node. */
	| "text";

export type UnclaimedHandler = (node: Node, ctx: EmitContext) => EmitResult | null;

export interface EmitContext {
	readonly node: Node;
	/** Root-first, excluding `node` itself. */
	readonly ancestors: readonly Node[];
	readonly parentTag: TokenIdentifier | undefined;

	/**
	 * Style accumulated from every enclosing `{ kind: "style" }` frame, merged
	 * with `mergeStyle` so an inner frame's explicit `false` overrides an outer
	 * `true`.
	 *
	 * This is the mechanism that reconciles a nested tree with flat formats. In
	 * the tree, `md:bold > md:italic > core:text`; in docx, one
	 * `<w:r><w:rPr><w:b/><w:i/></w:rPr>`. The emphasis emitters contribute
	 * frames and emit no element; the `core:text` emitter reads the total and
	 * builds the run. It is the exact inverse of `emphasisTags()` in style.ts,
	 * which the read profiles already use.
	 *
	 * Block roles ride the same stack - a blockquote contributes
	 * `{ blockRole: "quote" }` and the paragraph emitter reads it - because
	 * docx flattens block nesting for exactly the same reason.
	 */
	readonly style: ResolvedStyle;
	withStyle<R>(style: ResolvedStyle, fn: () => R): R;

	/** Emits a node's children into `parent`. Defaults to the current node. */
	children(parent: XmlElement, node?: Node): void;
	/** Emits one node into `parent`. */
	child(parent: XmlElement, node: Node): void;
	/** Flattens a subtree to plain text. Mirrors `SerializeContext.text`. */
	text(node?: Node): string;

	/** Element builder, bound to the profile's `nsMap`. */
	el(qname: string, attrs?: AttrMap, children?: XmlNode[]): XmlElement;
	txt(value: string): XmlText;

	readonly styles: StyleSink;
	readonly resources: ResourceSink;
	/** Per-document scratch space for stateful emitters. */
	readonly state: Map<string, unknown>;
	warn(message: string, node?: Node): void;
}

// ---- write-side sinks -----------------------------------------------------

export type StyleFamily = "paragraph" | "text" | "list" | "table";

/**
 * The inverse of `StyleTable`: interns a normalized style and hands back the
 * name a document should reference for it.
 *
 * odt needs this for everything, because ODF expresses even direct formatting
 * as a named automatic style. docx needs it only for block roles and list
 * numbering, since character formatting there is inline `<w:rPr>`.
 */
export interface StyleSink {
	/** Deduped on a canonical key, so identical styles share one definition. */
	ensure(style: ResolvedStyle, family?: StyleFamily): string;
	/** Definitions interned so far, in insertion order. */
	readonly defs: readonly StyleDef[];
}

export interface StyleSinkOptions {
	/** Generated-name prefixes per family. odt uses `{ paragraph: "P", text: "T" }`. */
	prefix?: Partial<Record<StyleFamily, string>>;
	/**
	 * Well-known name for a style, so a heading references `Heading_20_1`
	 * rather than an opaque `P3`. Return undefined to fall back to a generated
	 * name.
	 */
	name?(style: ResolvedStyle, family: StyleFamily): string | undefined;
}

export type ResourceType = "hyperlink" | "image";

export interface ResourceEntry {
	id: string;
	target: string;
	type: ResourceType;
	/** False for a part inside the package, true for an outbound URL. */
	external: boolean;
}

/**
 * Mints ids for targets a format references indirectly. docx serializes these
 * into `word/_rels/document.xml.rels`; odt writes `xlink:href` inline and
 * ignores the sink entirely.
 */
export interface ResourceSink {
	ensure(target: string, type: ResourceType): string;
	readonly entries: readonly ResourceEntry[];
}

// ---- write profiles -------------------------------------------------------

export interface WriteProfile {
	name: string;
	/** Consulted in array order; the first non-null result wins. */
	emitters: AnyEmitter[];
	/** Prefix-to-URI map, used both to build elements and to declare namespaces. */
	nsMap?: Record<string, string>;
	styles?: StyleSink;
	resources?: ResourceSink;
	/** Serialization mode for the emitted parts. Default "xml". */
	mode?: SerializeMode;
	/** Default "unwrap". */
	unclaimed?: UnclaimedPolicy | UnclaimedHandler;
	/**
	 * Wraps the emitted body into the finished set of parts.
	 *
	 * Everything a format needs *besides* its body - `[Content_Types].xml`,
	 * `META-INF/manifest.xml`, a styles part built from what the emit pass
	 * interned into the sinks - is generated here, once, after the whole tree
	 * has been walked. That ordering is required: an odt's automatic styles are
	 * not known until the last run has been emitted.
	 */
	assemble(body: XmlNode[], ctx: AssembleContext): WriteResult;
	onWarn?(message: string, node?: Node): void;
}

export interface AssembleContext {
	readonly profile: WriteProfile;
	readonly styles: StyleSink;
	readonly resources: ResourceSink;
	readonly state: Map<string, unknown>;
	readonly warnings: readonly string[];
	/** The tree that was rendered. */
	readonly root: Node;
	/** Serializes markup to text in the profile's mode, prefixed with `XML_DECL`. */
	serialize(node: XmlNode | XmlNode[]): string;
	el(qname: string, attrs?: AttrMap, children?: XmlNode[]): XmlElement;
	txt(value: string): XmlText;
}

/**
 * The output of a write pass: a package as a set of named parts.
 *
 * **Not zipped.** Shipping a ZIP implementation would be the only binary code
 * in clawmark and a much larger project, so the write side keeps the same
 * boundary the read side already has - callers hand parts in, callers zip
 * parts out.
 */
export interface WriteResult {
	/** Part path relative to the package root, mapped to its contents. */
	parts: Record<string, string>;
	/** Key in `parts` of the main document part. */
	primary: string;
	/** Suggested file extension, without the dot. */
	extension?: string;
	/** Media type of the assembled package. */
	mediaType?: string;
	warnings: string[];
}
