# @bearmetal/clawmark

A rule-based markup engine. Markdown to HTML, and arbitrary XML back to markdown — driven entirely
by a swappable set of `Rule` definitions rather than a fixed grammar.

```ts
import { htmlToMarkdown, toHtml, xmlToMarkdown } from "@bearmetal/clawmark";
```

Zero dependencies and no host APIs: no `DOMParser`, no `Deno.*`, no `globalThis`. The same code runs
in Deno, a browser, and a worker.

## The shape of it

Everything routes through one intermediate representation, a tree of `Node`s:

```
                  ┌──────────────┐
markdown ────────▶│              │────────▶ html
                  │  Node tree   │
xml/html ────────▶│              │────────▶ markdown
(docx, odt)       └──────────────┘
```

The four sides of that diagram are four hooks on a single `Rule` object, so a construct's HTML
output and its markdown output can never drift apart — they are written next to each other, in one
file, by one author.

## Quick start

### Forward: markdown in, HTML out

```ts
import { toDom, toHtml } from "@bearmetal/clawmark";

toHtml("# Hello");
// "<h1>Hello</h1>"

toHtml("- a\n  - b\n- c");
// "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>"

toDom("**bold**"); // DocumentFragment, when a Document is available
```

Text is HTML-escaped on the way out — `toHtml("<script>alert(1)</script>")` produces
`&lt;script&gt;…`, not a script tag.

### Reverse: HTML in, markdown out

```ts
import { htmlToMarkdown } from "@bearmetal/clawmark";

htmlToMarkdown("<h1>Hello</h1>");
// "# Hello\n"

htmlToMarkdown("<div><section><p>hi</p></section></div>");
// "hi\n"

htmlToMarkdown("<p>a &amp; b &mdash; c</p>");
// "a & b — c\n"
```

`htmlToMarkdown` also takes a live DOM node, so a browser can hand over `document.body` directly.

### Reverse: office documents

```ts
import { xmlToMarkdown } from "@bearmetal/clawmark";
import { docxProfile } from "@bearmetal/clawmark/profiles/docx";

xmlToMarkdown(documentXml, docxProfile({ styles, numbering, rels }));
```

The office profiles take the XML parts as strings — they do **not** unzip an archive. See
[docx](./profiles/docx) and [odt](./profiles/odt).

## Supported markdown

`defaultRules()` covers Markdown-equivalent syntax. Every construct below has both a forward rule
(markdown → HTML) and a reverse matcher (HTML → markdown).

| Construct       | Markdown                                                                   | HTML                                                                          |
| --------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Paragraph       | `Hello world`                                                              | `<p>Hello world</p>`                                                          |
| Heading         | `# One` … `###### Six`                                                     | `<h1>One</h1>` … `<h6>Six</h6>`                                               |
| Italic          | `*a*` or `_a_`                                                             | `<em>a</em>`                                                                  |
| Bold            | `**c**`                                                                    | `<strong>c</strong>`                                                          |
| Bold italic     | `***d***`                                                                  | `<strong><em>d</em></strong>`                                                 |
| Strikethrough   | `~~gone~~`                                                                 | `<s>gone</s>`                                                                 |
| Underline       | `++under++`                                                                | `<u>under</u>`                                                                |
| Highlight       | `==important==`                                                            | `<span class="highlight">important</span>`                                    |
| Inline code     | `` `x` ``                                                                  | `<code>x</code>`                                                              |
| Code block      | <code>\`\`\`ts … \`\`\`</code>                                             | `<pre class="code"><code>…</code></pre>`                                      |
| Link            | `[click here](url "Title")`                                                | `<a href="url" title="Title">click here</a>`                                  |
| Image           | `![alt text](img.png)`                                                     | `<img src="img.png" alt="alt text">`                                          |
| Horizontal rule | `---`                                                                      | `<hr>`                                                                        |
| Blockquote      | `> line`                                                                   | `<blockquote><p>line</p></blockquote>`                                        |
| Unordered list  | `- a`                                                                      | `<ul><li>a</li></ul>`                                                         |
| Ordered list    | `1. one`                                                                   | `<ol><li>one</li></ol>`                                                       |
| Checklist       | `- [x] done`                                                               | `<ul class="none"><li><input type="checkbox" disabled checked>done</li></ul>` |
| Table           | <code>&#124;a&#124;b&#124;</code> then <code>&#124;:-&#124;-:&#124;</code> | `<table><thead>…</thead>…</table>`                                            |
| Footnote        | `noted[^1]` + `[^1]: the note`                                             | `<sup><a href="#fn-1" id="fnref-1">1</a></sup>` + `<aside>`                   |
| Hard break      | a trailing <code>&#92;</code> before the newline                           | `<br>`                                                                        |
| Escape          | <code>2 &#92;* 3</code>                                                    | `<p>2 * 3</p>`                                                                |

Lists nest by indentation, inline code does not parse markup inside it, and a single newline inside
a paragraph is a soft wrap that collapses to a space.

Two deliberate divergences from CommonMark:

- **`<` is never escaped.** Clawmark has no raw-HTML rule, so `<script>` is plain text and
  round-trips exactly.
- **List continuation uses a 2-space indent**, because clawmark compares indentation magnitude only.
  Pass `listIndent: 4` if you are targeting a strict CommonMark parser.

## Output options

The serializer takes a `SerializeOptions` bag, accepted by `toMarkdown`, `xmlToMarkdown`, and
`htmlToMarkdown`:

```ts
import { defaultRules, parse, toMarkdown } from "@bearmetal/clawmark";

const tree = parse("- a\n  - b");

toMarkdown(tree);
// "- a\n  - b\n"

toMarkdown(tree, defaultRules(), { bullet: "*", listIndent: 4 });
// "* a\n    * b\n"
```

| Option       | Default | Effect                                                        |
| ------------ | ------- | ------------------------------------------------------------- |
| `bullet`     | `"-"`   | Unordered list marker: `-`, `*`, or `+`.                      |
| `emphasis`   | `"*"`   | Italic delimiter: `*` or `_`.                                 |
| `strong`     | `"**"`  | Bold delimiter: `**` or `__`.                                 |
| `listIndent` | `2`     | Continuation indent per list level, in spaces.                |
| `escape`     | `true`  | Escape characters that would otherwise be re-lexed as markup. |
| `eof`        | `"\n"`  | Trailing newline. Set `""` for none.                          |
| `onWarn`     | —       | Called for anything the serializer could not represent.       |

```ts
toMarkdown(parse("*i* and **b** here"), defaultRules(), {
	emphasis: "_",
	strong: "__",
	eof: "",
});
// "_i_ and __b__ here"
```

## Round-trip fidelity

`html → md → html` is the strong invariant, and it holds for every construct above.

`md → html → md` is a fixed point except in these cases, all of which are properties of the
_forward_ engine rather than of the reverse pipeline:

| Input                         | Output             | Why                                                                                 |
| ----------------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `_a_`                         | `*a*`              | Both lex to `md:italic`; the serializer picks one spelling.                         |
| `3. a`                        | `1. a`             | `orderedListRule.validate` discards the digits — ordinals never reach the tree.     |
| `a\nb`                        | `a b`              | A soft wrap collapses to a space in the lexer, irreversibly.                        |
| header-only table             | alignment lost     | Header cells always render centered, so only a body row carries the signal.         |
| <code>&#124;</code> in a cell | breaks on re-parse | `tableRule.tokenize` splits on a bare <code>&#124;</code> with no escape awareness. |
| markup in link text           | flattened          | Link text and image alt are opaque strings in both directions.                      |

The cosmetic differences all render to identical HTML, which is why the stronger invariant survives
them.

## Where to go next

- **[Rules](./rules)** — the `Rule` contract in both directions, and how to write your own.
- **[Reverse pipeline](./reverse)** — the crawler, match results, unmatched policies, and style
  resolution.
- **[Profile DSL](./dsl)** — `on()`, predicates, and building a profile for your own XML.
- **Profiles** — [HTML](./profiles/html), [docx](./profiles/docx), [odt](./profiles/odt).
- **[XML parser](./xml)** — the standalone portable XML/HTML parser.
- **[API reference](./api)** — every export, signature, and type.
