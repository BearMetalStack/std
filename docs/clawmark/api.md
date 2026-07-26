# API reference

Every export, grouped by what it is for. Prose and worked examples live on the other pages; this is
the lookup table.

## Entry points

Exported from `@bearmetal/clawmark`.

```ts
parse(input: string, rules?: AnyRule[]): Node
```

Parses markdown into a tree. Defaults to a fresh `defaultRules()`.

```ts
toHtml(input: string, rules?: AnyRule[]): string
```

Parses and renders straight to an HTML string.

```ts
toDom(input: string, doc?: Document, rules?: AnyRule[]): DocumentFragment
```

Parses and renders to a live DOM fragment. Throws if no `Document` is available.

```ts
toMarkdown(tree: Node, rules?: EngineRule[], options?: SerializeOptions): string
```

Serializes a tree back to markdown — the inverse of `parse`.

```ts
fromXml(source: string | XmlElement, profile: Profile): Node
```

Crawls an XML/HTML document into a tree using `profile`'s rules. Accepts source text or an
already-parsed element, so a caller who has unzipped a `.docx` can hand over the parsed
`document.xml` directly.

```ts
fromHtml(
  source: string | XmlElement | Element | Document | DocumentFragment,
  options?: HtmlProfileOptions,
): Node
```

Crawls HTML into a tree. Accepts source text or a live DOM node.

```ts
xmlToMarkdown(source: string | XmlElement, profile: Profile, options?: SerializeOptions): string
```

The whole reverse pipeline: XML/HTML source to markdown text.

```ts
htmlToMarkdown(
  source: string | XmlElement | Element | Document | DocumentFragment,
  options?: HtmlProfileOptions & SerializeOptions,
): string
```

The whole reverse pipeline for HTML — the inverse of `toHtml`.

```ts
defaultRules(): AnyRule[]
```

A **fresh** rule set for one parse/render pass. Stateful rules (lists, tables) are built via
factories precisely so calling this twice never lets one document's parse state bleed into
another's.

## Engine classes

Use these when the convenience functions don't give you a hook you need — a warning callback on the
crawl, for instance, or a tree you want to inspect between stages.

| Class                | Constructor               | Method                                           |
| -------------------- | ------------------------- | ------------------------------------------------ |
| `Lexer`              | `(input, rules)`          | `.tokenize(): Token[]`                           |
| `TreeBuilder`        | `(rules)`                 | `.build(tokens): Node`                           |
| `Renderer`           | `(rules)`                 | `.renderHtml(tree)`, `.renderDom(tree, doc?)`    |
| `MarkdownSerializer` | `(rules, options?)`       | `.serialize(tree): string`                       |
| `Crawler`            | `(options: CrawlOptions)` | `.crawl(root: XmlElement): Node`, `.styleOf(el)` |
| `XmlParser`          | `(input, options?)`       | `.parse(): XmlElement`                           |

```ts
postProcess(root: Node): Node
```

The three normalization passes the crawler runs at the end of every crawl. Exported so a hand-built
tree can get the same treatment.

```ts
prefixLines(text: string, first: string, rest: string, restBlank?: string): string
```

Prefixes every line. Blank lines get `restBlank` (defaulting to a trimmed `rest`) so nothing is left
carrying trailing whitespace.

## Options

### SerializeOptions

```ts
interface SerializeOptions {
	bullet?: "-" | "*" | "+"; // default "-"
	emphasis?: "*" | "_"; // default "*"
	strong?: "**" | "__"; // default "**"
	listIndent?: number; // default 2
	escape?: boolean; // default true
	eof?: "\n" | ""; // default "\n"
	onWarn?(message: string, node?: Node): void;
}
```

### CrawlOptions

```ts
interface CrawlOptions {
	rules?: EngineRule[];
	mode?: "xml" | "html"; // serialization mode for the `raw` policy. default "xml"
	unmatched?: UnmatchedPolicy | UnmatchedHandler; // default "unwrap"
	unmatchedByTag?: Record<string, UnmatchedPolicy | UnmatchedHandler>;
	styles?: StyleResolver;
	styleTable?: StyleTable;
	onWarn?(message: string, el?: XmlElement): void;
}
```

### XmlParseOptions

```ts
interface XmlParseOptions {
	mode?: "xml" | "html"; // default "xml"
	entities?: Record<string, string>;
	preserveComments?: boolean; // default false
	onError?(err: XmlParseError): void;
	strict?: boolean; // default false
}
```

## Core types

```ts
type Namespace = string;
type Identifier = string;
type TokenIdentifier = `${Namespace}:${Identifier}`;
type Char = string;

interface Token<T = Record<string, unknown>> {
	tag: TokenIdentifier;
	data: T;
}

interface Node<T = Record<string, unknown>> {
	tag: TokenIdentifier;
	data: T;
	children: Node[];
	parent?: Node;
}

const ROOT_TAG: TokenIdentifier; // "core:root"
const BOF_TOKEN: Token; // { tag: "core:bof", data: {} }
```

## Rule types

```ts
interface Rule<T> extends ReverseRule<T> {
	id: TokenIdentifier;
	requires?: TokenIdentifier[]; // rule interop — reserved, not implemented
	overrides?: TokenIdentifier[]; // ditto
	trigger: Char;
	validate(ctx: LexerContext): boolean;
	tokenize(ctx: LexerContext): Token<T> | Token<T>[];
	tree(token: Token<T>, ctx: TreeContext): void;
	renderOpen(node: Node<T>, ctx: RenderContext): string;
	renderClose?(node: Node<T>, ctx: RenderContext): string;
}

interface ReverseRule<T> {
	id: TokenIdentifier;
	matchTag?: string | string[];
	match?(el: XmlElement, ctx: MatchContext): MatchResult | null;
	serialize?(node: Node<T>, ctx: SerializeContext): string;
	serializeKind?: "block" | "inline"; // default "inline"
	preserveWhitespace?: boolean;
}

type AnyRule = Rule<any>;
type AnyReverseRule = ReverseRule<any>;
type EngineRule = AnyRule | AnyReverseRule; // anything the engine accepts
type RuleFactory = () => AnyRule;

function isForwardRule(rule: EngineRule): rule is AnyRule;
```

`isForwardRule` narrows by checking for a `validate` function — the engine holds a heterogeneous
array and needs to know which members can lex.

## Contexts

### LexerContext

```ts
interface LexerContext {
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

	discardBuffer(): void;
}
```

### TreeContext / RenderContext

```ts
interface TreeContext {
	readonly stack: Node[];
	readonly currentNode: Node;
}

interface RenderContext {
	renderMethod: "html" | "dom";
}
```

### MatchContext

```ts
interface MatchContext {
	readonly el: XmlElement;
	readonly ancestors: readonly XmlElement[]; // root-first, excluding el
	readonly parent?: XmlElement;
	readonly parentTag: TokenIdentifier | undefined; // enclosing *emitted* node

	readonly style: ResolvedStyle; // memoized, ancestor-cascaded
	styleOf(el: XmlElement): ResolvedStyle;
	readonly styleTable: StyleTable;

	attr(name: string, el?: XmlElement): string | undefined; // prefix-tolerant
	find(localName: string, el?: XmlElement): XmlElement | undefined;
	findAll(localName: string, el?: XmlElement): XmlElement[];
	child(localName: string, el?: XmlElement): XmlElement | undefined;
	text(el?: XmlElement): string; // flattened, normalized, trimmed
	raw(el?: XmlElement): string; // verbatim, no collapsing

	crawlChildren(parent: Node, el?: XmlElement): void;
	readonly state: Map<string, unknown>;
	warn(message: string, el?: XmlElement): void;
}
```

### SerializeContext

```ts
interface SerializeContext {
	readonly options: Required<Omit<SerializeOptions, "onWarn">> & Pick<SerializeOptions, "onWarn">;
	readonly lists: readonly ListFrame[]; // innermost last, empty at top level
	withList<T>(frame: ListFrame, fn: (frame: ListFrame) => T): T;

	node(node: Node): string; // one node, through its rule
	children(node: Node): string; // children, joined per serializeKind
	text(node: Node): string; // flatten a subtree to plain text

	isBlock(node: Node): boolean;
	escape(value: string, position?: EscapePosition): string;
	prefixLines(text: string, first: string, rest: string, restBlank?: string): string;

	defer(key: string, block: string): void; // queue a block for document end
	readonly state: Map<string, unknown>;
	warn(message: string, node?: Node): void;
}

interface ListFrame {
	kind: "ordered" | "unordered";
	ordinal: number; // 1-based index of the item being emitted
	indent: string; // continuation indent contributed by this level
}

type EscapePosition = "inline" | "lineStart" | "cell" | "linkText" | "linkDest" | "title";
```

`defer` is how footnote definitions reach the bottom of the document: the reference emits inline and
queues its definition, keyed so a repeated reference doesn't duplicate it.

`EscapePosition` matters because escaping is position-sensitive. `lineStart` escapes markers that
only start a construct at the beginning of a line; `cell` escapes pipes; `linkDest` percent-encodes
spaces and parentheses; `linkText` and `title` escape nothing and _must not_, since link text is
captured raw in both directions.

## Reverse types

```ts
type SerializeKind = "block" | "inline";
type WhitespaceMode = "normal" | "pre";
type UnmatchedPolicy = "unwrap" | "raw" | "drop";
type UnmatchedHandler = (el: XmlElement, ctx: MatchContext) => MatchResult | null;

type MatchResult =
	| {
		kind: "wrap";
		tag: TokenIdentifier;
		data?: Record<string, unknown>;
		whitespace?: WhitespaceMode;
	}
	| { kind: "leaf"; tag: TokenIdentifier; data?: Record<string, unknown> }
	| { kind: "nodes"; nodes: Node[] }
	| { kind: "unwrap" }
	| { kind: "drop" }
	| { kind: "raw" }
	| { kind: "custom"; run(parent: Node, ctx: MatchContext): void };
```

## Style types

```ts
interface ResolvedStyle {
	named?: string;
	blockRole?: "heading" | "paragraph" | "quote" | "code" | "list" | "table";
	headingLevel?: number;
	bold?: boolean;
	italic?: boolean;
	strike?: boolean;
	underline?: boolean;
	mono?: boolean;
	highlight?: boolean;
	list?: { kind: "ordered" | "unordered" | "check"; level: number; checked?: boolean; id?: string };
	align?: "l" | "c" | "r";
	ext?: Record<string, unknown>;
}

interface StyleResolver {
	own(el: XmlElement, table: StyleTable): ResolvedStyle;
	inherits?: readonly (keyof ResolvedStyle)[]; // defaults to DEFAULT_INHERITS
}

interface StyleDef {
	id: string;
	name?: string;
	basedOn?: string;
	type?: "paragraph" | "character" | "table" | "numbering" | "list";
	style: ResolvedStyle;
}

interface StyleTable {
	get(idOrName: string): StyleDef | undefined;
	resolve(idOrName: string): ResolvedStyle; // flattened through basedOn. memoized, cycle-safe
	readonly defaults: ResolvedStyle;
}
```

### Style functions

```ts
createStyleTable(defs: StyleDef[], defaults?: ResolvedStyle): StyleTable
lookupAttr(el: XmlElement | undefined, name: string): string | undefined
onOff(el: XmlElement | undefined, attr?: string): boolean | undefined
mergeStyle(base: ResolvedStyle, over: ResolvedStyle): ResolvedStyle
pickStyle(style: ResolvedStyle, keys: readonly (keyof ResolvedStyle)[]): ResolvedStyle

const DEFAULT_INHERITS: readonly (keyof ResolvedStyle)[];
const EMPTY_STYLE_TABLE: StyleTable;
```

## Profile type

```ts
interface Profile {
	name: string;
	rules: EngineRule[];
	styles?: StyleResolver;
	styleTable?: StyleTable;
	nsMap?: Record<string, string>; // prefix -> URI, so on("w:p") resolves
	parse?: XmlParseOptions;
	unmatched?: UnmatchedPolicy | UnmatchedHandler;
	unmatchedByTag?: Record<string, UnmatchedPolicy | UnmatchedHandler>;
}
```

## DSL

```ts
on(tag: string | string[], nsMap?: Record<string, string>): RuleBuilder
onAny(): RuleBuilder
onStyle(pred: (s: ResolvedStyle, ctx: MatchContext) => boolean): RuleBuilder
scopedOn(nsMap: Record<string, string>): (tag: string | string[]) => RuleBuilder
```

**Predicates** (free functions of type `Matcher = (el, ctx) => boolean`):

```ts
style(nameOrPattern: string | RegExp)
whereStyle(pred: (s: ResolvedStyle, ctx: MatchContext) => boolean)
attr(name: string, value?: string | RegExp)
hasClass(name: string)
hasChild(localName: string)
hasAncestor(localName: string)
inside(tag: TokenIdentifier)
ns(uri: string)
textMatches(pattern: RegExp)
not(matcher: Matcher)
all(...matchers: Matcher[])
any(...matchers: Matcher[])
```

**Builder:**

```ts
interface RuleBuilder {
	where(...predicates: Matcher[]): RuleBuilder;
	whereStyle(pred: (s: ResolvedStyle, ctx: MatchContext) => boolean): RuleBuilder;
	whereAttr(name: string, value?: string | RegExp): RuleBuilder;
	whereNs(uri: string): RuleBuilder;
	whereAncestor(localName: string): RuleBuilder;
	whereChild(localName: string): RuleBuilder;
	whereNot(...predicates: Matcher[]): RuleBuilder;
	named(id: string): RuleBuilder;

	wrap(tag: TokenIdentifier, data?: DataSpec): AnyReverseRule;
	emit(tag: TokenIdentifier, data?: DataSpec): AnyReverseRule;
	nodes(build: (el: XmlElement, ctx: MatchContext) => Node[]): AnyReverseRule;
	unwrap(): AnyReverseRule;
	drop(): AnyReverseRule;
	raw(): AnyReverseRule;
	to(fn: (el: XmlElement, ctx: MatchContext) => MatchResult | null): AnyReverseRule;
}

type DataSpec =
	| Record<string, unknown>
	| ((el: XmlElement, ctx: MatchContext) => Record<string, unknown>);
```

## XML

```ts
parseXml(src: string, opts?: XmlParseOptions): XmlElement
parseHtml(src: string, opts?: Omit<XmlParseOptions, "mode">): XmlElement
serializeXml(node: XmlNode, mode?: "xml" | "html"): string
fromDom(source: Element | Document | DocumentFragment): XmlElement
decodeEntities(
  input: string,
  extra?: Record<string, string>,
  onBad?: (name: string, offset: number) => void,
): string

const namedEntities: Record<string, string>;
const VOID: Set<string>;
const RAW_TEXT: Set<string>;
const ESCAPABLE_RAW: Set<string>;
const PRE_ELEMENTS: Set<string>;
const AUTO_CLOSE: Record<string, Set<string>>;
const DOCUMENT_NAME: string;   // "#document"
```

Node model and error types are in [the XML parser page](./xml#the-node-model).

## Export map

| Specifier                           | Contents                                                        |
| ----------------------------------- | --------------------------------------------------------------- |
| `@bearmetal/clawmark`               | Everything below except the profiles and `rules/extra`.         |
| `@bearmetal/clawmark/types`         | Types only.                                                     |
| `@bearmetal/clawmark/xml`           | The parser, node model, `fromDom`, `serializeXml`, HTML tables. |
| `@bearmetal/clawmark/crawl`         | `Crawler`, `postProcess`.                                       |
| `@bearmetal/clawmark/serialize`     | `MarkdownSerializer`, `prefixLines`.                            |
| `@bearmetal/clawmark/style`         | Style helpers and `createStyleTable`.                           |
| `@bearmetal/clawmark/dsl`           | `on`, predicates, `RuleBuilder`.                                |
| `@bearmetal/clawmark/profiles/html` | `htmlProfile`, `htmlStyleResolver`, `parseInlineStyle`.         |
| `@bearmetal/clawmark/profiles/docx` | `docxProfile` and its style/numbering/rels helpers.             |
| `@bearmetal/clawmark/profiles/odt`  | `odtProfile` and its style/list helpers.                        |
| `@bearmetal/clawmark/rules/extra`   | Reserved slot for optional syntax rules. Ships empty.           |

Everything reachable from the root specifier is also reachable from its narrower one; the subpaths
exist so a consumer that only needs the XML parser doesn't pull the rule set in with it.
