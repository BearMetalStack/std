# Rules

Clawmark has no grammar. It has an array of `Rule` objects, and everything the engine does is
dispatch into that array. Swapping the array swaps the language.

```ts
import { defaultRules, parse, toHtml, toMarkdown } from "@bearmetal/clawmark";

const rules = defaultRules();
toHtml("# Hi", rules);
toMarkdown(parse("# Hi", rules), rules);
```

`defaultRules()` returns a **fresh** set every call. Stateful rules (lists, tables) are built by
factories precisely so one document's parse state can never bleed into another's — don't hoist a
single shared array across concurrent parses.

## Anatomy of a rule

A rule owns one construct across all four directions. The forward half is required; the reverse half
is optional.

```ts
import type { Rule } from "@bearmetal/clawmark";

type HeadingData = { level: number; phase: "open" | "close" };

export const headingRule: Rule<HeadingData> = {
	id: "md:heading",

	// ---- forward: markdown -> tokens -> tree -> html ----
	trigger: "#",
	validate: (ctx) => ctx.cursor === ctx.lineStart,
	tokenize(ctx) {
		const level = ctx.peek(6).match(/^#{1,6}/)?.[0].length ?? 1;
		ctx.cursor += level - 1;
		if (ctx.peek(1, 1) === " ") ctx.cursor += 1;
		ctx.pushBlock("md:heading", { singleLine: true });
		return { tag: "md:heading", data: { level, phase: "open" } };
	},
	tree(token, ctx) {
		if (token.data.phase === "open") openNode(ctx, "md:heading", token.data);
		else closeNode(ctx);
	},
	renderOpen: (node) => `<h${node.data.level}>`,
	renderClose: (node) => `</h${node.data.level}>`,

	// ---- reverse: xml -> tree -> markdown ----
	matchTag: ["h1", "h2", "h3", "h4", "h5", "h6"],
	match: (el) => ({
		kind: "wrap",
		tag: "md:heading",
		data: { level: Number(el.name[1]), phase: "open" },
	}),
	serializeKind: "block",
	serialize: (node, ctx) => `${"#".repeat(node.data.level)} ${ctx.children(node)}`,
};
```

The `T` in `Rule<T>` is the shape of `Node.data` for the nodes this rule produces. Export your rule
as `Rule<YourData>` for internal type safety; the engine erases it to `AnyRule` at the registration
boundary.

### id

A `TokenIdentifier`: `namespace:identifier`. It is simultaneously the rule's name, the tag of the
nodes it produces, and the key the tree builder, renderer, and serializer dispatch on. `md:` is
markdown syntax, `core:` is engine-owned (`core:root`, `core:text`, `core:paragraph`), `rev:` is
[reverse-only](#reverse-only-rules).

## The forward half

### trigger and validate

The lexer walks the input one character at a time. When it hits a rule's single-character `trigger`,
it calls `validate` — a cheap guard that decides whether this occurrence really is the construct.

```ts
// only at the start of a line
validate: (ctx) => ctx.cursor === ctx.lineStart,

// only when the *next* character also matches
validate: (ctx) => ctx.peek(2) === "~~",

// unconditionally; the tree hook sorts out open vs close
validate: () => true,
```

**Array order is precedence.** The first rule whose `trigger` matches and whose `validate` returns
`true` wins. That is why `hrRule` sits before the list rules in `defaultRules()` — `---` has to be a
horizontal rule, not three unordered list markers.

A rule with `validate: () => false` never fires from source text. That is not dead code: several
rules exist only to own a _tag_ for the tree builder, renderer, and serializer, and are driven by
another rule's tokenizer (`md:bold` is emitted by the shared emphasis tokenizer) or directly by the
core lexer (`core:paragraph`).

### LexerContext

Passed to `validate` and `tokenize`.

| Member                                       | Purpose                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `peek(length, offset?)`                      | The next `length` characters from `cursor + offset`.             |
| `toNextSubstring(sub, offset?)`              | Everything from the cursor through the next occurrence of `sub`. |
| `cursor`                                     | Read/write. Advance it to consume input.                         |
| `lineStart`                                  | Offset of the current line's first character.                    |
| `currentLine`                                | The whole current line.                                          |
| `previousToken`                              | The last token emitted, or `core:bof`.                           |
| `pushBlock(tag, { singleLine })`             | Register an open multi-line block.                               |
| `popBlock()` / `currentBlock` / `blockDepth` | The open-block stack.                                            |
| `discardBuffer()`                            | Throw away buffered text instead of flushing it.                 |

**The block stack** is how a rule-based lexer knows what to auto-close. A rule that opens something
spanning multiple lines (blockquote, list, table, code fence, footnote definition) registers itself
with `pushBlock`, and the core lexer's newline handling closes the top of the stack without needing
to know what it is. `singleLine: true` means "close me on _any_ newline" — that is how a heading
ends.

**`discardBuffer()` is for one specific problem**, and it must be called from `validate`. The lexer
flushes buffered plain text right before `tokenize` runs, so a rule that needs to _discard_ rather
than flush has to pre-empt that from the only hook that runs earlier. The ordered-list rule uses it:
by the time `1.` is recognized, the `1` is already buffered as text, and flushing it would emit a
stray literal digit.

### tokenize

Returns a `Token<T>` or an array of them. Advance `ctx.cursor` past whatever you consumed — the
lexer advances by one on its own, so consuming an `n`-character marker means `cursor += n - 1`.

Returning a `core:text` token instead bails out to a literal, which is what the link and inline-code
rules do when a span they thought they recognized turns out to be unclosed. The tree builder
special-cases that tag before ever touching `.data`, so it is a safe escape hatch from the per-rule
`Token<T>` typing.

### tree

Turns a token into tree structure. `TreeContext` is deliberately minimal — the raw `stack` and a
`currentNode` getter — and rules push and pop it directly:

```ts
// open
const node = { tag: "md:sup", data: {}, children: [], parent: ctx.currentNode };
ctx.currentNode.children.push(node);
ctx.stack.push(node);

// close
ctx.stack.pop();

// leaf: append without pushing
ctx.currentNode.children.push({ tag: "md:linebreak", data: {}, children: [] });
```

The in-tree rules wrap these three lines in the free functions `openNode` / `closeNode` /
`appendLeaf` / `closeIfCurrentIs` (`rules/helpers.ts`, not part of the package's public export map).
They are free functions rather than interface members, so anything satisfying the minimal
`{ stack, currentNode }` shape still works.

### renderOpen / renderClose

Strings, emitted around the node's rendered children. `renderClose` is optional — omit it for
leaves.

Both receive a `RenderContext` carrying `renderMethod` (`"html"` or `"dom"`), but note that DOM
output is produced by rendering the HTML string once and parsing it in a single pass: the contract
has no per-rule "build a real element" hook, so there is nothing faithful to do with a live document
per node.

Escape everything you interpolate — text content _and_ every attribute value. Unescaped text
reaching `innerHTML` is a stored-XSS footgun, and the default rules escape rigorously; a custom rule
that doesn't undoes that.

## The reverse half

Four optional members, all inherited from `ReverseRule`. A rule that only handles markdown syntax
stays valid without them.

### matchTag

Element _local names_ this rule's `match` is registered under — namespace prefixes stripped,
lowercased in HTML mode. `"*"` (or omitting it) puts the rule in the wildcard bucket, consulted for
every element.

The wildcard bucket is what makes docx work at all: there, every block is a `<w:p>` and the real
distinction lives in the resolved style, not the tag name.

Both buckets are merge-sorted by position in the rules array at dispatch time, so precedence is
exactly "position in the array" — the same rule as everywhere else in clawmark.

### match

```ts
match(el: XmlElement, ctx: MatchContext): MatchResult | null
```

Return `null` to decline; the crawler tries the next candidate rule, then falls back to the
[unmatched policy](./reverse#unmatched-elements). Declining is how a rule stays context-sensitive:

```ts
// A <p> inside a blockquote is an md:lineitem, not a paragraph.
match: (_el, ctx) =>
  ctx.parentTag === "md:blockquote"
    ? null
    : { kind: "wrap", tag: "core:paragraph", data: { phase: "open" } },
```

The seven `MatchResult` kinds are documented in [the reverse pipeline](./reverse#match-results).

### serialize and serializeKind

```ts
serialize(node: Node<T>, ctx: SerializeContext): string
```

**The contract: return your node's content with no surrounding blank lines and no line prefix
applied.** Framing is the parent's job. Threading a mutable prefix down through the recursion is how
blockquote-inside-list bugs happen.

`serializeKind: "block"` tells the serializer to separate this node from its siblings with a blank
line; the default `"inline"` concatenates. Omitting `serialize` entirely makes the node serialize as
just its children, which is right for purely presentational wrappers.

`SerializeContext` is documented in [the API reference](./api#serializecontext). The pieces you
reach for most:

```ts
serialize: (node, ctx) => `~~${ctx.children(node)}~~`,          // recurse
serialize: (node, ctx) => `[${ctx.escape(node.data.text, "linkText")}]…`, // escape
serialize: (node, ctx) => ctx.prefixLines(ctx.children(node), "> ", "> "), // frame
```

### preserveWhitespace

Suppresses whitespace collapsing inside this node. Set it on code and pre-formatted constructs.

## A complete custom rule

Superscript — `^text^` — from scratch, in both directions. Modeled on `strikethroughRule`, which is
the smallest complete rule in the default set.

```ts
import type { Node, Rule } from "@bearmetal/clawmark";

type SupData = Record<string, never>;

export const supRule: Rule<SupData> = {
	id: "md:sup",
	trigger: "^",
	validate: (ctx) => ctx.peek(1) === "^",

	tokenize: () => ({ tag: "md:sup", data: {} }),

	// One token type, toggled: open unless we are already inside one.
	tree(_token, ctx) {
		if (ctx.currentNode.tag === "md:sup") {
			ctx.stack.pop();
			return;
		}
		const parent = ctx.currentNode;
		const node: Node<SupData> = { tag: "md:sup", data: {}, children: [], parent };
		parent.children.push(node as Node);
		ctx.stack.push(node as Node);
	},

	renderOpen: () => "<sup>",
	renderClose: () => "</sup>",

	matchTag: "sup",
	match: () => ({ kind: "wrap", tag: "md:sup", data: {} }),

	serialize: (node, ctx) => `^${ctx.children(node)}^`,
};
```

Register it ahead of the defaults, since array order is precedence:

```ts
import { defaultRules, parse, toHtml, toMarkdown } from "@bearmetal/clawmark";

const rules = [supRule, ...defaultRules()];

toHtml("E = mc^2^", rules);
// "<p>E = mc<sup>2</sup></p>"

toMarkdown(parse("E = mc^2^", rules), rules);
// "E = mc^2^\n"
```

And the reverse direction comes free, because `match` and `serialize` are on the same object:

```ts
import { xmlToMarkdown } from "@bearmetal/clawmark";

xmlToMarkdown("<p>E = mc<sup>2</sup></p>", {
	name: "sup",
	parse: { mode: "html" },
	rules,
});
// "E = mc^2^\n"
```

## Reverse-only rules

A construct that exists in a source format but has no markdown syntax of its own doesn't need the
forward contract at all. Give it an id in the `rev:` namespace and implement only
`matchTag`/`match`:

```ts
import type { AnyReverseRule } from "@bearmetal/clawmark";

const dropComments: AnyReverseRule = {
	id: "rev:drop-annotation",
	matchTag: "annotation",
	match: () => ({ kind: "drop" }),
};
```

This works because `TreeBuilder` and `Renderer` key their dispatch maps on `Rule.id` and throw on an
unregistered **node tag** — and no node ever carries a `rev:` tag. Those maps are simply never
consulted for these rules, so nothing throws and no `validate`/`tokenize`/`tree`/`renderOpen` stubs
are needed.

Writing these by hand gets repetitive fast. The [profile DSL](./dsl) generates them, with `rev:` ids
assigned automatically.

## Node tags

The tags produced by `defaultRules()`, and therefore the tags a reverse matcher can target:

| Tag                                       | Data                             | Kind                         |
| ----------------------------------------- | -------------------------------- | ---------------------------- |
| `core:root`                               | —                                | Document root.               |
| `core:text`                               | `{ value }`                      | Text. Not owned by any rule. |
| `core:paragraph`                          | `{ phase }`                      | Block                        |
| `md:heading`                              | `{ level, phase }`               | Block                        |
| `md:blockquote`                           | `{ phase }`                      | Block                        |
| `md:lineitem`                             | `{ phase }`                      | A line within a blockquote.  |
| `md:orderedlist` / `md:unorderedlist`     | `{ phase, style? }`              | Block                        |
| `md:listitem`                             | `{ phase }`                      | Block                        |
| `md:checkitem`                            | `{ phase, checked }`             | Block                        |
| `md:table`                                | `{ columns, phase }`             | Block                        |
| `md:tablerow`                             | `{ columns: string[] }`          | Block                        |
| `md:tableformat`                          | `{ columns: ("l"\|"c"\|"r")[] }` | Block                        |
| `md:codeblock`                            | `{ value, lang? }`               | Block                        |
| `md:hr`                                   | —                                | Block                        |
| `md:footnotedef`                          | `{ id }`                         | Block                        |
| `md:raw`                                  | `{ value }`                      | Block. Emitted verbatim.     |
| `md:italic` / `md:bold` / `md:bolditalic` | —                                | Inline                       |
| `md:strikethrough` / `md:highlight`       | —                                | Inline                       |
| `md:code`                                 | `{ value }`                      | Inline                       |
| `md:link`                                 | `{ href, text, title? }`         | Inline leaf                  |
| `md:image`                                | `{ src, alt? }`                  | Inline leaf                  |
| `md:footnote`                             | `{ id }`                         | Inline leaf                  |
| `md:linebreak`                            | —                                | Inline leaf                  |

`md:link` and `md:image` keep their text in `data`, never as child nodes — which is why markup
inside link text is opaque in both directions.

## Extension points

`rules/extra/mod.ts`, exported as `@bearmetal/clawmark/rules/extra`, is the reserved slot for
optional _syntax_ rules — constructs that extend the markdown language itself. It ships empty.

Reverse-only rules belong in a [profile](./dsl) instead, with `rev:` ids that keep them out of the
forward dispatch maps entirely.
