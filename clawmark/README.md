# @bearmetal/clawmark

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fclawmark&valueColor=info)](https://jsr.io/@bearmetal/clawmark)

A rule-based markup engine driven entirely by a swappable set of `Rule` definitions rather than a
fixed grammar. It runs in both directions:

```
                  ┌──────────────┐
markdown ────────▶│              │────────▶ html
                  │  Node tree   │
xml/html ────────▶│              │────────▶ markdown
(docx, odt)       └──────────────┘
```

`defaultRules()` covers Markdown-equivalent syntax (headings, emphasis, lists, tables, blockquotes,
links, images, footnotes, code, horizontal rules), plus the common extensions `~~strikethrough~~`,
`==highlight==`, and `++underline++` — the last in the markdown-it-ins tradition, because the office
formats this engine reverses have underline even though CommonMark does not. Zero dependencies, no
host APIs — the same code runs in Deno, a browser, and a worker.

```ts
import { htmlToMarkdown, toHtml, xmlToMarkdown } from "@bearmetal/clawmark";
import { docxProfile } from "@bearmetal/clawmark/profiles/docx";

toHtml("# Hello"); // <h1>Hello</h1>
htmlToMarkdown("<h1>Hello</h1>"); // # Hello
xmlToMarkdown(documentXml, docxProfile({ styles, numbering }));
```

## Both directions from one rule

A `Rule` owns a construct in both directions, so its HTML output and its markdown output can never
drift apart:

```ts
export const headingRule: Rule<HeadingData> = {
	id: "md:heading",
	trigger: "#",
	validate: (ctx) => ctx.cursor === ctx.lineStart,
	tokenize: (ctx) => /* ... */,
	tree: (token, ctx) => /* ... */,

	renderOpen: (node) => `<h${node.data.level}>`,
	renderClose: (node) => `</h${node.data.level}>`,

	matchTag: ["h1", "h2", "h3", "h4", "h5", "h6"],
	match: (el) => ({ kind: "wrap", tag: "md:heading", data: { level: Number(el.name[1]) } }),
	serializeKind: "block",
	serialize: (node, ctx) => `${"#".repeat(node.data.level)} ${ctx.children(node)}`,
};
```

The reverse hooks are all optional, so a rule that only handles markdown syntax stays valid.

## Profiles

A profile is a rule set plus the style machinery it needs. `htmlProfile()` is the default;
`docxProfile()` and `odtProfile()` handle OOXML and OpenDocument, where the same construct is
expressed completely differently — a heading is `<h2>`, or `<w:pStyle w:val="Heading2"/>`, or
`<text:h text:outline-level="2">`.

Profiles are written declaratively:

```ts
import { on, onStyle } from "@bearmetal/clawmark/dsl";

on("w:p").whereStyle((s) => s.blockRole === "heading").wrap("md:heading", (el, ctx) => ({
	level: ctx.style.headingLevel ?? 1,
}));
onStyle((s) => s.bold).wrap("md:bold");
on(["w:sectPr", "w:proofErr"]).drop();
```

Elements no rule claims follow a configurable policy — `unwrap` (default), `raw`, `drop`, or a
callback — settable globally and per tag.

**The office profiles do not unzip archives.** A ZIP/inflate implementation would be the only binary
code in the package and a much larger project, so callers hand over the parts they need as strings:
`document.xml` and optionally `styles.xml`, `numbering.xml`, and `document.xml.rels`. Every part is
optional; without `styles.xml` the docx profile falls back to matching style names heuristically,
which covers most real documents.

## Round-trip fidelity

`md → html → md` is a fixed point for every construct except these, all of which are properties of
the _forward_ engine rather than of the reverse pipeline:

| Input               | Output             | Why                                                                               |
| ------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `_a_`               | `*a*`              | Both lex to `md:italic`; the serializer picks one spelling.                       |
| `3. a`              | `1. a`             | `orderedListRule.validate` discards the digits — ordinals never reach the tree.   |
| `a\nb`              | `a b`              | A soft wrap collapses to a space in the lexer, irreversibly.                      |
| header-only table   | alignment lost     | Header cells are always rendered centered, so only a body row carries the signal. |
| `\|` in a cell      | breaks on re-parse | `tableRule.tokenize` splits on a bare `\|` with no escape awareness.              |
| markup in link text | flattened          | Link text and image alt are opaque strings in both directions.                    |

`html → md → html` is the stronger invariant and holds throughout, since the cosmetic differences
above all render identically.

Two further divergences from CommonMark are deliberate: `<` is never escaped (clawmark has no
raw-HTML rule, so `<script>` is plain text and round-trips exactly), and list continuation uses a
2-space indent (clawmark compares indentation magnitude only). Set `listIndent: 4` if you are
targeting a strict CommonMark parser.

## Extending

`rules/extra/mod.ts` (exported as `@bearmetal/clawmark/rules/extra`) is the reserved slot for
optional _syntax_ rules. Reverse-only rules belong in a profile and should take ids in the `rev:`
namespace, which keeps them out of the forward dispatch maps entirely.
