# @bearmetal/clawmark

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fclawmark&valueColor=info)](https://jsr.io/@bearmetal/clawmark)

A rule-based markup engine driven entirely by a swappable set of `Rule` definitions rather than a
fixed grammar. Every input meets every output in the middle:

```
                   ┌──────────────┐
markdown ─────────▶│              │─────────▶ html
                   │              │─────────▶ markdown
html ─────────────▶│  Node tree   │─────────▶ docx
                   │              │─────────▶ odt
docx, odt, xml ───▶│              │─────────▶ (your profile)
                   └──────────────┘
```

Which is to say it is not really a markdown library. Markdown is the syntax it happens to ship rules
for; the engine underneath is a markup-to-markup converter, and the node tree in the middle is the
only thing any two formats have to agree on.

`defaultRules()` covers Markdown-equivalent syntax (headings, emphasis, lists, tables, blockquotes,
links, images, footnotes, code, horizontal rules), plus the common extensions `~~strikethrough~~`,
`==highlight==`, and `++underline++` — the last in the markdown-it-ins tradition, because the office
formats this engine reverses have underline even though CommonMark does not. Zero dependencies, no
host APIs — the same code runs in Deno, a browser, and a worker.

```ts
import { convert, htmlToMarkdown, markdownWith, toHtml, xmlToMarkdown } from "@bearmetal/clawmark";
import { docxProfile, docxWriter } from "@bearmetal/clawmark/profiles/docx";
import { odtWriter } from "@bearmetal/clawmark/profiles/odt";

toHtml("# Hello"); // <h1>Hello</h1>
htmlToMarkdown("<h1>Hello</h1>"); // # Hello

// reading
xmlToMarkdown(documentXml, docxProfile({ styles, numbering }));

// writing
markdownWith("# Hello", docxWriter()).parts["word/document.xml"];

// and both at once
convert(documentXml, docxProfile({ styles }), odtWriter());
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

A format has a **read profile** and a **write profile**, and they are separate objects because their
inputs have nothing in common — a reader is configured with the source parts it was handed, a writer
with how the output should look.

`htmlProfile()` is the default reader; `docxProfile()` and `odtProfile()` handle OOXML and
OpenDocument, where the same construct is expressed completely differently — a heading is `<h2>`, or
`<w:pStyle w:val="Heading2"/>`, or `<text:h text:outline-level="2">`. `docxWriter()` and
`odtWriter()` go the other way.

Both halves are written declaratively, and `out()` reads as the inverse of `on()`:

```ts
import { on, onStyle, out } from "@bearmetal/clawmark/dsl";

// reading
on("w:p").whereStyle((s) => s.blockRole === "heading").wrap("md:heading", (el, ctx) => ({
	level: ctx.style.headingLevel ?? 1,
}));
onStyle((s) => s.bold).wrap("md:bold");
on(["w:sectPr", "w:proofErr"]).drop();

// writing
out("md:heading").wrap("text:h", (node) => ({ "text:outline-level": node.data.level }));
out("md:bold").style({ bold: true });
out("md:tablerow").drop();
```

Elements no rule claims follow a configurable policy — `unwrap` (default), `raw`, `drop`, or a
callback. Node tags no emitter claims follow the same idea with `unclaimed`.

**The office profiles do not zip or unzip archives.** A ZIP/inflate implementation would be the only
binary code in the package and a much larger project, so the boundary is the same in both
directions: callers hand parts in, and get parts back out.

```ts
const out = markdownWith(md, docxWriter());
out.parts; // "word/document.xml", "word/styles.xml", "[Content_Types].xml", …
out.primary; // "word/document.xml"
```

For reading, every part is optional; without `styles.xml` the docx profile falls back to matching
style names heuristically, which covers most real documents. For writing, note that an odt's
`mimetype` entry has to be stored **first and uncompressed** — that is a property of the archive
rather than of the bytes, so it is the caller's to get right:

```sh
zip -X -0 out.odt mimetype && zip -X -r out.odt . -x mimetype
```

## Conversion, not reproduction

The node tree carries no source-format context, which makes `convert()` a normalizer rather than a
copier:

```ts
convert(badContentXml, odtProfile({ styles }), odtWriter());
```

A document from an exporter that plays fast and loose with the spec — Google Docs writes headings as
`<text:p>` with a heading style and an _empty_ `style:default-outline-level`, never as `<text:h>` —
comes back out built to spec, because the writer builds from the normalized tree and has no idea
what the input looked like. The corollary is that anything the node vocabulary and `ResolvedStyle`
cannot express is dropped on the way through. That is the trade, and it is the point.

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

`md → docx → md` and `md → odt → md` are fixed points for every construct in that list, tested
against the engine's own `md → md` output so the forward lossiness above is not counted twice. What
the office formats lose on top of it is genuinely theirs:

| Construct                | docx                    | odt  | Why                                                                                       |
| ------------------------ | ----------------------- | ---- | ----------------------------------------------------------------------------------------- |
| code block language      | lost                    | lost | Neither format has a slot for it, and inventing an attribute would defeat the point.      |
| task list check state    | becomes a `☐`/`☒` glyph | same | Neither format has a checkbox a list item can carry.                                      |
| emphasis inside emphasis | flattens to siblings    | kept | A `<w:r>` cannot contain a `<w:r>`; a `<text:span>` can contain a `<text:span>`.          |
| non-numeric `[^label]`   | renumbered, warns       | kept | A docx footnote id is an integer. ODF keeps the citation text.                            |
| table alignment          | lost                    | lost | The readers flatten every cell to plain text, so only a body row's own markers survive.   |
| image dimensions         | placeholder             | n/a  | clawmark never opens the file, so `<wp:extent>` gets `imageExtent` (one inch by default). |

Two further divergences from CommonMark are deliberate: `<` is never escaped (clawmark has no
raw-HTML rule, so `<script>` is plain text and round-trips exactly), and list continuation uses a
2-space indent (clawmark compares indentation magnitude only). Set `listIndent: 4` if you are
targeting a strict CommonMark parser.

## Extending

`rules/extra/mod.ts` (exported as `@bearmetal/clawmark/rules/extra`) is the reserved slot for
optional _syntax_ rules. Reverse-only rules belong in a profile and should take ids in the `rev:`
namespace, which keeps them out of the forward dispatch maps entirely; emitters take `out:` ids for
the same reason.

A new output format is a `WriteProfile`: an array of emitters, optionally a `StyleSink` and a
`ResourceSink`, and an `assemble` that turns the emitted body into named parts. Nothing about it is
markdown-specific — emitters key on node tags, and the tags are whatever the rule set in play emits.
`singlePart()` covers a format that is one document and no boilerplate:

```ts
import { out, singlePart } from "@bearmetal/clawmark";

const myWriter: WriteProfile = {
	name: "mine",
	emitters: [out("md:heading").wrap("title"), out("core:paragraph").wrap("para")],
	assemble: singlePart("doc.xml", { extension: "xml" }),
};
```
