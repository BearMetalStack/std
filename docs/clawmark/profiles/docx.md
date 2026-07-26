# The docx profile

WordprocessingML (OOXML) back to markdown.

```ts
import { docxProfile } from "@bearmetal/clawmark/profiles/docx";
import { xmlToMarkdown } from "@bearmetal/clawmark";

const md = xmlToMarkdown(documentXml, docxProfile({ styles, numbering, rels }));
```

## Scope boundary: no unzipping

**This does not unzip a `.docx`.** A ZIP/inflate implementation would be the only binary code in
clawmark and a much larger project than the rest of the package combined. Callers hand over the
parts they need as strings.

```ts
interface DocxParts {
	styles?: string | XmlElement; // word/styles.xml
	numbering?: string | XmlElement; // word/numbering.xml
	rels?: string | XmlElement; // word/_rels/document.xml.rels
	rules?: AnyReverseRule[]; // extra rules, consulted before the built-ins
}
```

The document itself — `word/document.xml` — is the first argument to `xmlToMarkdown`, not part of
`DocxParts`.

Every part is **optional**. Without `styles.xml` the profile falls back to matching style names
heuristically, which covers most real documents. Pair it with whatever unzip library you already
have:

```ts
import { unzip } from "some-zip-library";
import { docxProfile } from "@bearmetal/clawmark/profiles/docx";
import { xmlToMarkdown } from "@bearmetal/clawmark";

const files = await unzip(await Deno.readFile("report.docx"));
const text = (path: string) => files[path] && new TextDecoder().decode(files[path]);

const md = xmlToMarkdown(
	text("word/document.xml")!,
	docxProfile({
		styles: text("word/styles.xml"),
		numbering: text("word/numbering.xml"),
		rels: text("word/_rels/document.xml.rels"),
	}),
);
```

Passing an already-parsed `XmlElement` instead of a string works everywhere, so a caller who parses
the parts for other reasons doesn't pay for it twice.

## Blocks

docx has no heading element, no blockquote element, and no list element. Every block is a `<w:p>`,
and the distinction lives in the resolved style — which is why the profile leans on the
wildcard-and-style matching the [DSL](../dsl#onstyle-pred) exists for.

### Headings

```xml
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>
```

```ts
xmlToMarkdown(doc, docxProfile({ styles })); // "# Title"
```

The level comes from `ResolvedStyle.headingLevel`, resolved from `styles.xml` when present and from
the style name otherwise:

```
Heading3, with styles.xml            ->  ### Sub
Heading2, with no styles.xml at all  ->  ## Sub    (the name heuristic still fires)
```

An `<w:outlineLvl>` in the paragraph properties is honored too, and becomes
`headingLevel = outline + 1`.

### Paragraphs, quotes, and code

```xml
<w:p><w:r><w:t>Body text</w:t></w:r></w:p>                        <!-- Body text -->
<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>…</w:p>              <!-- > Quoted -->
<w:p><w:pPr><w:pStyle w:val="SourceCode"/></w:pPr>…</w:p>         <!-- code block -->
```

A `blockRole: "code"` paragraph is emitted as a `leaf` carrying `ctx.text(el)` — the text is taken
flat, so runs inside a code paragraph don't sprout emphasis markers.

### Structural noise

Dropped before anything else looks at them, subtree and all:

`w:sectPr`, `w:proofErr`, `w:bookmarkStart`, `w:bookmarkEnd`, `w:lastRenderedPageBreak`, `w:pPr`,
`w:rPr`, `w:tblPr`, `w:tblGrid`, `w:trPr`, `w:tcPr`

```xml
<w:p><w:pPr><w:sectPr/></w:pPr><w:bookmarkStart w:id="1"/><w:r><w:t>x</w:t></w:r></w:p>
```

```
x
```

The property elements are dropped as _content_ here; the style resolver reads them separately, off
the element, before the crawler ever recurses.

## Runs and character formatting

Character formatting lives on `<w:r>`, either as direct `<w:rPr>` properties or through an
`<w:rStyle>` reference.

```xml
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r></w:p>
```

```
**bold**
```

| Run property                     | Markdown        |
| -------------------------------- | --------------- |
| `<w:b/>`                         | `**bold**`      |
| `<w:i/>`                         | `*italic*`      |
| `<w:b/><w:i/>`                   | `***both***`    |
| `<w:strike/>`                    | `~~gone~~`      |
| `<w:u w:val="single"/>`          | `++under++`     |
| `<w:highlight w:val="yellow"/>`  | `==highlight==` |
| `<w:rFonts w:ascii="Consolas"/>` | `` `code` ``    |
| none of the above                | unwrapped       |

A run carrying several of these keeps them all, as one nested chain — `<w:b/><w:u/>` comes out
`++**both**++`. The one exception is mono, which wins outright: a code span cannot nest emphasis in
markdown.

### Explicit off toggles

`<w:b/>` with no attribute means on. `w:val="0"`, `"false"`, `"off"`, or `"none"` means explicitly
**off** — and that has to override an inherited bold rather than say nothing:

```xml
<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>plain</w:t></w:r></w:p>
```

```
plain
```

This is why `mergeStyle` distinguishes `undefined` from `false`.

### Text, tabs, and breaks

| Element                      | Handling                                                      |
| ---------------------------- | ------------------------------------------------------------- |
| `<w:t>`                      | Unwrapped — the text flows through the whitespace normalizer. |
| `<w:t xml:space="preserve">` | Built directly as a text node, **bypassing** collapsing.      |
| `<w:tab/>`                   | A single space.                                               |
| `<w:br/>`                    | `md:linebreak` — a hard break.                                |

```xml
<w:p>
  <w:r><w:t xml:space="preserve">a </w:t></w:r>
  <w:r><w:rPr><w:b/></w:rPr><w:t>b</w:t></w:r>
</w:p>
```

```
a **b**
```

Without the `xml:space` handling that trailing space is collapsed away and the output reads
`a**b**`.

## Lists

**docx has no list element.** A list is just consecutive paragraphs that happen to carry a
`<w:numPr>` with an `<w:ilvl>`. The profile reconstructs it with a
[`custom` match result](../reverse#custom): the first such paragraph claims the whole run, builds
the nesting from the `ilvl` sequence, and marks the rest consumed in `ctx.state` so the crawler
skips them.

```xml
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
  <w:r><w:t>a</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr>
  <w:r><w:t>b</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
  <w:r><w:t>c</w:t></w:r></w:p>
```

```
- a
  - b
- c
```

The run ends where the list paragraphs stop, so an ordinary paragraph after one closes it cleanly:

```
- a

after
```

### Ordered vs bulleted

`numbering.xml` decides, via `numId` → `abstractNumId` → the level-0 `<w:numFmt>`:

```xml
<w:numbering>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>
```

`numId="1"` gives `- a`; `numId="2"` gives `1. a`.

**Absent or unresolvable numbering defaults to unordered.** Guessing "bulleted" is visually
harmless; guessing "numbered" invents ordinals that were never in the document.

```ts
import { docxNumbering } from "@bearmetal/clawmark/profiles/docx";

docxNumbering(numberingXml); // Map { "1" => "unordered", "2" => "ordered" }
```

## Hyperlinks

`<w:hyperlink>` carries a relationship id, resolved through `document.xml.rels`:

```xml
<w:p><w:hyperlink r:id="rId4"><w:r><w:t>site</w:t></w:r></w:hyperlink></w:p>
```

```xml
<Relationships …><Relationship Id="rId4" Target="https://example.com"/></Relationships>
```

```
[site](https://example.com)
```

Without `rels`, the profile falls back to `w:anchor` (an internal bookmark), then to `#`.

```ts
import { docxRelationships } from "@bearmetal/clawmark/profiles/docx";

docxRelationships(relsXml); // Map { "rId4" => "https://example.com" }
```

## Tables

`<w:tbl>` becomes an `md:table`, **flattening every cell to plain text** — markdown table cells
cannot hold block content, so there is nothing else to do with a cell that contains three
paragraphs.

```xml
<w:tbl>
  <w:tr><w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr>
  <w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
```

```
|a|b|
|:-|:-|
|1|2|
```

The first row becomes the header and an all-left alignment row is synthesized after it — docx column
alignment is per-cell rather than per-column, so there is no single value to carry over.

## Style resolution

### With styles.xml

`docxStyleTable` reads every `<w:style>` into a [`StyleDef`](../reverse#styletable), picking up
`w:styleId`, `<w:name>`, `<w:basedOn>`, the paragraph properties (`<w:jc>` alignment,
`<w:outlineLvl>`) and the run properties.

```ts
import { docxStyleTable } from "@bearmetal/clawmark/profiles/docx";

const table = docxStyleTable(stylesXml);
table.resolve("Derived"); // flattened through the whole basedOn chain
```

`basedOn` chains flatten root-first so the most derived style wins, and the walk is cycle-guarded —
real documents do contain `basedOn` cycles.

### Without styles.xml

The profile matches the `w:pStyle` value against the usual English style names:

| Pattern                                    | Resolved                               |
| ------------------------------------------ | -------------------------------------- |
| `heading 1` … `heading 6`                  | `blockRole: "heading"`, matching level |
| `title`                                    | heading, level 1                       |
| `subtitle`                                 | heading, level 2                       |
| `quote`, `intense quote`, `block text`     | `blockRole: "quote"`                   |
| `code`, `source code`, `html preformatted` | `blockRole: "code"`, `mono`            |
| `list paragraph`                           | `blockRole: "list"`                    |

All patterns are case- and space-insensitive (`Heading1`, `heading 1`, and `HEADING  1` all match).

```ts
import { styleFromName } from "@bearmetal/clawmark/profiles/docx";

styleFromName("Heading3"); // { blockRole: "heading", headingLevel: 3 }
```

### Localized style ids

Word on a non-English installation writes a **localized `w:styleId` alongside an English `w:name`**:

```xml
<w:style w:styleId="Uberschrift1"><w:name w:val="heading 1"/></w:style>
```

The style table is indexed by **both**, id winning on collision, and the heuristics are matched
against the name first. Index only the id and every heading in a German-authored document silently
disappears.

```ts
xmlToMarkdown(doc, docxProfile({ styles })); // "# Titel"
```

## Exports

```ts
import {
	DOCX_NS, // { w: WML_NS, r: REL_NS }
	docxNumbering, // numbering.xml -> Map<numId, "ordered" | "unordered">
	docxProfile,
	docxRelationships, // rels -> Map<Id, Target>
	docxStyleResolver, // StyleResolver for WordprocessingML
	docxStyleTable, // styles.xml -> StyleTable
	REL_NS,
	styleFromName, // name/id -> ResolvedStyle, via the heuristics
	WML_NS,
} from "@bearmetal/clawmark/profiles/docx";
```

The pieces are separately exported so a profile of your own can reuse the parts it needs — a
template-specific profile that keeps docx's numbering handling but replaces its style heuristics,
for instance.

## Extending

`parts.rules` is consulted **before** the built-ins, so any behavior can be overridden without
forking:

```ts
import { on } from "@bearmetal/clawmark";
import { docxProfile } from "@bearmetal/clawmark/profiles/docx";

docxProfile({
	styles,
	numbering,
	rules: [
		// a company template's "Callout" style becomes a blockquote
		on("w:p").whereStyle((s) => s.named === "Callout").wrap("md:blockquote", { phase: "open" }),
		// keep content controls' content, discard the wrapper
		on(["w:sdt", "w:sdtContent"]).unwrap(),
		// drop comment ranges entirely
		on(["w:commentRangeStart", "w:commentRangeEnd", "w:commentReference"]).drop(),
	],
});
```
