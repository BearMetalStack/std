# The reverse pipeline

XML or HTML in, markdown out. Three stages:

```
source text ──▶ XmlParser ──▶ XmlElement tree
                                   │
                             Crawler + rules  ◀── styles
                                   │
                              Node tree
                                   │
                          MarkdownSerializer
                                   │
                              markdown text
```

The crawler is the only new machinery. The `Node` tree it produces is the same one the forward lexer
builds, so the serializer neither knows nor cares which direction the tree came from.

## Entry points

| Function                                   | Input                                | Output      |
| ------------------------------------------ | ------------------------------------ | ----------- |
| `htmlToMarkdown(source, options?)`         | HTML text, `XmlElement`, or live DOM | markdown    |
| `xmlToMarkdown(source, profile, options?)` | XML text or `XmlElement`             | markdown    |
| `fromHtml(source, options?)`               | as above                             | `Node` tree |
| `fromXml(source, profile)`                 | as above                             | `Node` tree |
| `toMarkdown(tree, rules?, options?)`       | `Node` tree                          | markdown    |

The `*ToMarkdown` pair are just `from*` composed with `toMarkdown`. Split them when you want to
inspect or rewrite the tree in between:

```ts
import { defaultRules, fromHtml, toMarkdown } from "@bearmetal/clawmark";

const tree = fromHtml("<h1>Title</h1><p>Body</p>");
tree.children = tree.children.filter((n) => n.tag !== "md:heading");
toMarkdown(tree, defaultRules());
// "Body\n"
```

`fromHtml` accepts a live `Element`, `Document`, or `DocumentFragment` and adapts it via `fromDom`,
so in a browser you can hand over `document.body` and skip parsing entirely.

## Profiles

A `Profile` is a named bundle of reverse rules plus the style machinery they depend on.

```ts
interface Profile {
	name: string;
	rules: EngineRule[];
	styles?: StyleResolver;
	styleTable?: StyleTable;
	nsMap?: Record<string, string>;
	parse?: XmlParseOptions;
	unmatched?: UnmatchedPolicy | UnmatchedHandler;
	unmatchedByTag?: Record<string, UnmatchedPolicy | UnmatchedHandler>;
}
```

Three ship with the package — [`htmlProfile()`](./profiles/html),
[`docxProfile()`](./profiles/docx), [`odtProfile()`](./profiles/odt) — and it is a plain object, so
writing your own is nothing more than filling in the fields. See [the profile DSL](./dsl) for the
declarative way to build `rules`.

`rules` almost always ends with `...defaultRules()`, which supplies the `serialize` hooks for every
`md:` tag your matchers emit. Without it the serializer has no idea how to write `md:heading` back
out and silently falls through to the node's children.

## How the crawl works

The crawler walks the XML tree depth-first. For each element it collects the candidate rules and
takes the first one whose `match` returns non-`null`.

Candidates come from two buckets:

- **by local name** — rules whose `matchTag` names this element;
- **wildcard** — rules with `matchTag: "*"` or no `matchTag` at all, consulted for every element.

Two buckets cannot be ordered against each other by array position alone, so every rule carries its
source index and the buckets are merge-sorted at dispatch (memoized per tag name). **Precedence is
therefore exactly position in the rules array** — the same rule as the forward lexer.

Buckets key on the _local_ name, prefix stripped, because prefixes are not stable across producers:
a document is free to bind `w14:` or rebind `w:`. Namespace _URIs_ are stable, so that is what
matching checks.

If every candidate declines, the [unmatched policy](#unmatched-elements) decides.

## Match results

`match` returns one of seven shapes.

### wrap

Open a node, recurse into the element's children, close it. The workhorse.

```ts
on("t").wrap("md:heading", { level: 2 });
// <d><t>hi</t></d>  ->  "## hi"
```

An array of tags opens a nested chain, outermost first, recursing into the innermost — one element
can carry several formattings at once (an odt span that is bold _and_ underlined), and a single wrap
tag would force every profile to hand-build that nesting via `custom`. `data` lands on the outermost
node.

```ts
on("t").wrap(["md:underline", "md:bold"]);
// <p><t>hi</t></p>  ->  "++**hi**++"
```

An optional `whitespace: "pre"` suppresses whitespace collapsing for the subtree.

### leaf

Emit a childless node. The matcher has consumed the whole subtree — anything inside the element is
discarded unless the matcher pulled it into `data` itself.

```ts
on("img-ref").emit("md:image", (el) => ({
	src: el.attrs.get("src") ?? "",
	alt: el.attrs.get("alt") ?? "",
}));
// <img-ref src="a.png" alt="cat">ignored</img-ref>  ->  "![cat](a.png)"
```

### nodes

Emit several ready-built siblings. Use it when one element becomes more than one node, or when you
need a node whose text bypasses the whitespace normalizer.

```ts
on("sep").nodes(() => [{ tag: "core:text", data: { value: " / " }, children: [] }]);
// <p>a<sep/>b</p>  ->  "a / b"
```

### unwrap

Drop the element, keep crawling its children into the current parent. This is the default policy,
and the right answer for layout-only elements.

```ts
on("bare").unwrap();
// <d><bare>x</bare>y</d>  ->  "xy"
```

### drop

Drop the element and its whole subtree.

```ts
on("skip").drop();
// <d><skip>x</skip>y</d>  ->  "y"
```

### raw

Emit the element verbatim as an `md:raw` node, serialized with the profile's `mode`.

```ts
on("keep").raw();
// <d><keep a="1"/></d>  ->  '<keep a="1"/>'
```

In HTML mode void elements stay void instead of gaining a closing tag.

### custom

Full control. The matcher drives its own recursion via `ctx.crawlChildren`, which is what you need
when one element becomes a structure the other kinds can't express — or when a construct spans
_sibling_ elements rather than nesting.

```ts
on("rows").to(() => ({
	kind: "custom",
	run(parent, ctx) {
		const list = { tag: "md:unorderedlist", data: { phase: "open" }, children: [], parent };
		parent.children.push(list);
		for (const row of ctx.findAll("row")) {
			const item = { tag: "md:listitem", data: { phase: "open" }, children: [], parent: list };
			list.children.push(item);
			ctx.crawlChildren(item, row);
		}
	},
}));
// <rows><row>a</row><row>b</row></rows>  ->  "- a\n- b"
```

The docx profile's list reconstruction is the real-world version of this: docx has no list
_element_, only consecutive `<w:p>`s carrying a `<w:numPr>`, so the first paragraph of a run claims
all of them, builds the nesting from the `ilvl` sequence, and marks the rest consumed in `ctx.state`
so the crawler skips them.

## MatchContext

Passed to every `match`.

### Position

| Member      | Meaning                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| `el`        | The element being matched.                                                |
| `ancestors` | Root-first, excluding `el`.                                               |
| `parent`    | The immediate parent element.                                             |
| `parentTag` | Clawmark tag of the enclosing _emitted_ node, or `undefined` at the root. |

`parentTag` is what makes blockquotes work: a `<p>` inside an `md:blockquote` must become an
`md:lineitem`, while a `<p>` anywhere else is a `core:paragraph`. It reflects the output tree, not
the input tree, which is exactly the distinction you need.

### Lookup

| Member                    | Meaning                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `attr(name, el?)`         | Attribute value, tolerant of prefix variance: `attr("val")` finds `w:val`. |
| `child(localName, el?)`   | First _direct_ child with that local name.                                 |
| `find(localName, el?)`    | First _descendant_.                                                        |
| `findAll(localName, el?)` | All descendants.                                                           |
| `text(el?)`               | Flattened, whitespace-normalized, trimmed text of a subtree.               |
| `raw(el?)`                | Verbatim text, no collapsing. For `<pre>`-like content.                    |

Every one of these defaults to `el` when the second argument is omitted.

### Style

| Member        | Meaning                                                 |
| ------------- | ------------------------------------------------------- |
| `style`       | Normalized, ancestor-cascaded style for `el`. Memoized. |
| `styleOf(el)` | The same, for any element.                              |
| `styleTable`  | The profile's named-style table.                        |

### Control

| Member                       | Meaning                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `crawlChildren(parent, el?)` | Recurse into an element's children, appending under `parent`. |
| `state`                      | Per-document `Map` scratch space for stateful profiles.       |
| `warn(message, el?)`         | Report a problem. See [warnings](#warnings).                  |

## Unmatched elements

An element no rule claimed follows a configurable policy, settable globally and per tag.

```ts
type UnmatchedPolicy = "unwrap" | "raw" | "drop";
type UnmatchedHandler = (el: XmlElement, ctx: MatchContext) => MatchResult | null;
```

`unwrap` is the default: keep the content, discard the element. It is the safe answer, since
dropping loses text and `raw` leaks markup into the output.

```ts
import { htmlToMarkdown } from "@bearmetal/clawmark";

// default: unwrap
htmlToMarkdown("<p>a <custom>b</custom> c</p>");
// "a b c\n"

// per tag
htmlToMarkdown("<p>a</p><video src='v.mp4'></video>", {
	unmatchedByTag: { video: "raw" },
});
// 'a\n\n<video src="v.mp4"></video>\n'

htmlToMarkdown("<p>a</p><aside2>gone</aside2>", {
	unmatchedByTag: { aside2: "drop" },
});
// "a\n"

// a callback decides per element
htmlToMarkdown("<p>a</p><x-thing>b</x-thing>", {
	unmatched: (el) => el.name.startsWith("x-") ? { kind: "drop" } : null,
});
// "a\n"
```

A handler returning `null` falls back to the global policy, so per-tag handlers are allowed to be
partial. `unmatchedByTag` overrides `unmatched` for the tags it names.

## Whitespace

Collapsing happens during the crawl, not at serialize time. That keeps the invariant _a `Node` tree
always holds markdown-ready text_, so a tree built by the forward lexer is never double-processed
and deliberate spacing in markdown source survives.

The subtle part is the reset rule: entering or leaving a **block** clears the pending-space flag,
while inline nodes leave it alone. That one distinction is what keeps the space in one case and
drops it in the other:

```ts
htmlToMarkdown("<p><b>a</b> <i>b</i></p>"); // "**a** *b*\n"  — space kept
htmlToMarkdown("<p>a</p> <p>b</p>"); // "a\n\nb\n"     — space dropped
htmlToMarkdown(`
  <div>
    <p>First</p>
    <p>Second</p>
  </div>
`); // "First\n\nSecond\n"  — pretty-printing does not leak
```

Inside `<pre>` (and anywhere a rule sets `whitespace: "pre"` or `preserveWhitespace`) collapsing is
off:

````ts
htmlToMarkdown("<pre><code>a\n  indented\n</code></pre>");
// "```\na\n  indented\n```\n"
````

## Post-processing

`postProcess` runs at the end of every crawl. Three passes, in order, each fixing a shape that is
legal in HTML but unrepresentable — or wrongly represented — in markdown.

| Pass                     | Fixes                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `foldEmphasis`           | `<strong><em>x</em></strong>` → one `md:bolditalic`, so it writes `***x***` rather than `**_x_**`.        |
| `collapseSoleParagraphs` | `<li><p>x</p></li>` → item content, so the blank line inside the item doesn't re-lex as "the list ended". |
| `mergeAdjacentText`      | Coalesces text nodes left adjacent by unwrapping.                                                         |

It is exported, so a hand-built tree can get the same treatment:

```ts
import { postProcess } from "@bearmetal/clawmark";
postProcess(tree);
```

## Style resolution

This is the piece that makes docx and odt tractable. A rule must not have to know that a heading is
`<w:pPr><w:pStyle w:val="Heading1"/>` in one format and `<text:h text:outline-level="1">` in
another. It asks for a `ResolvedStyle` and matches on that.

### ResolvedStyle

A normalized, format-independent description:

```ts
interface ResolvedStyle {
	named?: string; // "Heading1" / "Quote" / "T1"
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
	ext?: Record<string, unknown>; // format-specific, never read by core
}
```

`ext` is deliberately a named bag rather than an index signature: an open index signature would
destroy autocomplete on `whereStyle((s) => s.bold)`, which is the whole ergonomic point of having a
normalized style.

### StyleResolver

```ts
interface StyleResolver {
	own(el: XmlElement, table: StyleTable): ResolvedStyle;
	inherits?: readonly (keyof ResolvedStyle)[];
}
```

`own` reports the style an element contributes _by itself_ — direct formatting plus named-style
references. The crawler handles the cascade, merging an ancestor's resolved style under it.

**`inherits` defaults to character-level properties only**, and that restriction is the single most
important constraint in the style system. If `blockRole` / `headingLevel` / `list` cascaded, every
`<w:r>` inside a Heading1 paragraph would report `blockRole: "heading"` and every heading matcher
would fire on every run.

```ts
import { DEFAULT_INHERITS } from "@bearmetal/clawmark";
// ["bold", "italic", "strike", "underline", "mono", "highlight", "align"]
```

### StyleTable

The named-style index, flattening `basedOn` chains on demand.

```ts
import { createStyleTable, EMPTY_STYLE_TABLE } from "@bearmetal/clawmark";

const table = createStyleTable([
	{ id: "Base", name: "Base", style: { bold: true } },
	{ id: "Derived", name: "Derived", basedOn: "Base", style: { italic: true } },
]);

table.resolve("Derived"); // { bold: true, italic: true }
table.get("Derived"); // the StyleDef
table.defaults; // the base style every resolve starts from
```

Two properties worth knowing:

- **Indexed by both id and name, with id winning on collision.** Not pedantry: docx separates
  `w:styleId` from `w:name`, and a non-English Word installation writes a localized id
  (`Überschrift1`) alongside an English name (`heading 1`). Index only one and every non-English
  document silently loses its headings.
- **The resolve walk is cycle-guarded and depth-capped** (32), because real documents in the wild do
  contain `basedOn` cycles and an unguarded walk simply hangs.

### Style helpers

| Function                            | Purpose                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `lookupAttr(el, name)`              | Attribute lookup ignoring prefix: finds `w:val`, `val`, or any other binding.          |
| `onOff(el, attr?)`                  | OOXML/ODF toggle. `<w:b/>` is on; `val="0"\|"false"\|"off"\|"none"` is explicitly off. |
| `mergeStyle(base, over)`            | Merge. `undefined` does not clobber; `false` does.                                     |
| `pickStyle(style, keys)`            | Subset, skipping absent properties.                                                    |
| `createStyleTable(defs, defaults?)` | Build a `StyleTable`.                                                                  |

The `undefined` vs `false` distinction in `mergeStyle` exists because of `onOff`: a run that
switches bold _off_ must override an inherited bold, not be treated as saying nothing.

## Warnings

`ctx.warn` in a matcher and `ctx.warn` in a `serialize` hook both report through callbacks — but the
top-level helpers don't plumb one through for the crawl. To collect crawl warnings, drive the
`Crawler` yourself:

```ts
import { Crawler, MarkdownSerializer, parseXml } from "@bearmetal/clawmark";

const warnings: string[] = [];

const tree = new Crawler({
	rules: profile.rules,
	styles: profile.styles,
	styleTable: profile.styleTable,
	unmatched: profile.unmatched,
	onWarn: (message) => warnings.push(message),
}).crawl(parseXml(source));

const md = new MarkdownSerializer(profile.rules, {
	onWarn: (message) => warnings.push(message),
}).serialize(tree);
```

Serializer warnings alone are simpler — `SerializeOptions.onWarn` is accepted by `toMarkdown`,
`xmlToMarkdown`, and `htmlToMarkdown` directly.
