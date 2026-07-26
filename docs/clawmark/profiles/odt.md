# The odt profile

OpenDocument text (ODF) back to markdown.

```ts
import { odtProfile } from "@bearmetal/clawmark/profiles/odt";
import { xmlToMarkdown } from "@bearmetal/clawmark";

const md = xmlToMarkdown(contentXml, odtProfile({ styles }));
```

Structurally friendlier than [docx](./docx): headings and lists _can_ be real elements
(`<text:h text:outline-level>`, `<text:list>` / `<text:list-item>`) — but real exports are not that
tidy. Google Docs, for one, writes headings as `<text:p>` with a `Title` / `Subtitle` / `Heading N`
paragraph style, so styled paragraphs run through the same name heuristics as docx.

## Scope boundary: no unzipping

Same as docx — **this does not unzip an `.odt`.** Hand over `content.xml` as the document, and
optionally `styles.xml`.

```ts
interface OdtParts {
	styles?: string | XmlElement; // styles.xml
	content?: string | XmlElement; // content.xml, to index its automatic styles up front
	rules?: AnyReverseRule[]; // extra rules, consulted before the built-ins
}
```

ODF's _automatic styles_ — the generated `T1`, `P2` names carrying the direct formatting an author
actually applied — live in `content.xml` itself. The profile indexes the crawled document's own
`<office:automatic-styles>` when the crawl reaches them, which is before any body element resolves a
style, so `odtProfile({ styles })` is all a normal call needs. The `content` part remains for the
rare case where the automatic styles must be available before the crawl starts (say, resolving
styles from `parts.rules` setup code).

`content.xml` and `styles.xml` both contribute definitions, and automatic styles win, since those
carry the direct formatting.

## Blocks

### Headings

`<text:h>` carries its level directly. No style table needed:

```xml
<text:h text:outline-level="1">Title</text:h>
<text:h text:outline-level="3">Sub</text:h>
```

```
# Title

### Sub
```

A `<text:p>` whose resolved style has `blockRole: "heading"` becomes a heading too. The role comes
from either a non-empty `style:default-outline-level` on the style, or — far more often in the wild
— the style-name heuristics: `Title` is level 1, `Subtitle` level 2, `Heading N` level N
(`style:display-name` when present, otherwise the decoded `style:name`, so `Heading_20_1` reads as
"Heading 1"). `style:parent-style-name` chains count: a `P4` automatic style based on `Heading_20_1`
inherits the heading role.

```xml
<text:p text:style-name="Title">The Book</text:p>
<text:p text:style-name="Subtitle">A Subtitle</text:p>
```

```
# The Book

## A Subtitle
```

Google Docs exports contain no `<text:h>` at all and write `default-outline-level=""` (empty) on
every heading style — the name heuristics are what carry them.

### Paragraphs and quotes

```xml
<text:p>Body</text:p>
<text:p>a</text:p><text:p>b</text:p>
```

```
Body

a

b
```

A paragraph whose resolved style has `blockRole: "quote"` becomes a blockquote instead.

**A `<text:p>` inside a list item is unwrapped**, not treated as a block of its own — ODF wraps
every item's content in a paragraph, and honoring it would put a blank line inside each item, which
re-lexes as "the list ended".

A paragraph style's _character_ formatting still applies, in and out of lists — a paragraph whose
style is italic wraps its content in `*…*`.

### Dropped elements

Discarded with their subtrees: `office:automatic-styles`, `office:styles`, `office:font-face-decls`,
`text:tracked-changes`, `text:sequence-decls`, `text:bookmark`.

```xml
<text:p>a</text:p><text:bookmark text:name="x"/><text:sequence-decls/>
```

```
a
```

The style elements are dropped as _content_ only after being harvested into the style table — that
mid-crawl harvest is what lets `odtProfile({ styles })` resolve the document's own automatic styles.

## Lists

Real elements, so no reconstruction is needed:

```xml
<text:list text:style-name="L1">
  <text:list-item>
    <text:p>a</text:p>
    <text:list text:style-name="L1">
      <text:list-item><text:p>b</text:p></text:list-item>
    </text:list>
  </text:list-item>
  <text:list-item><text:p>c</text:p></text:list-item>
</text:list>
```

```
- a
  - b
- c
```

`<text:list-header>` is treated as a `md:listitem` too — markdown has no separate concept for it,
and dropping it would lose the text.

### Ordered vs bulleted

The list's `text:style-name` is looked up in the `<text:list-style>` definitions, **at the list's
nesting level**: a `<text:list-level-style-number>` at that `text:level` makes it ordered, a
`-bullet` (or anything else) bulleted.

```xml
<text:list-style style:name="L1"><text:list-level-style-bullet text:level="1"/></text:list-style>
<text:list-style style:name="L2"><text:list-level-style-number text:level="1"/></text:list-style>
```

```
- a      <!-- text:style-name="L1" -->
1. a     <!-- text:style-name="L2" -->
```

Per level is not optional. Exporters routinely define all ten levels of a style, and they need not
agree — Google Docs writes bulleted list styles whose levels 1–9 are bullets while level 10 is
numbered, so any whole-style answer would turn every bulleted list in such a document ordered.

Nested `<text:list>` elements usually carry no `text:style-name` of their own; the nearest named
ancestor list supplies it. Unknown or absent list styles default to unordered, for the same reason
as docx: guessing "numbered" invents ordinals.

```ts
import { odtListStyles } from "@bearmetal/clawmark/profiles/odt";

// Map { "L1" => Map { 1 => "unordered" }, "L2" => Map { 1 => "ordered" } }
odtListStyles(stylesXml, contentXml);
```

## Character formatting

`<text:span>` resolves its `text:style-name` through the automatic-style table.

```xml
<office:automatic-styles>
  <style:style style:name="T1"><style:text-properties fo:font-weight="bold"/></style:style>
  <style:style style:name="T2" style:parent-style-name="T1">
    <style:text-properties fo:font-style="italic"/></style:style>
  <style:style style:name="T3">
    <style:text-properties style:text-line-through-style="solid"/></style:style>
</office:automatic-styles>
```

```xml
<text:p><text:span text:style-name="T1">bold</text:span></text:p>   <!-- **bold** -->
<text:p><text:span text:style-name="T2">both</text:span></text:p>   <!-- ***both*** -->
<text:p><text:span text:style-name="T3">gone</text:span></text:p>   <!-- ~~gone~~ -->
<text:p>a <text:span>b</text:span></text:p>                          <!-- a b -->
```

`T2` comes out bold _and_ italic because `style:parent-style-name` is ODF's `basedOn`, running
through the same chain-flattening machinery.

A span carrying several formattings keeps them all, as one nested chain — bold + italic + underline
comes out `++***all***++`. Spans resolve their **own** named style, not the ancestor cascade:
paragraph-level formatting is already wrapped by the paragraph rules, and re-matching it at the span
would nest the same emphasis twice.

| Text property                                                             | Recognized as |
| ------------------------------------------------------------------------- | ------------- |
| `fo:font-weight` = `bold` or `600`–`900`                                  | `bold`        |
| `fo:font-style` = `italic` / `oblique`                                    | `italic`      |
| `style:text-line-through-style` ≠ `none`                                  | `strike`      |
| `style:text-underline-style` ≠ `none`                                     | `underline`   |
| `style:font-name` / `fo:font-family` matching mono/courier/consolas/menlo | `mono`        |
| `fo:background-color` ≠ `transparent`                                     | `highlight`   |

A `mono` span becomes inline code carrying flat text; an unstyled span is transparent.

## Inline elements

| Element                       | Becomes                                |
| ----------------------------- | -------------------------------------- |
| `<text:a xlink:href="…">`     | `[text](href)`                         |
| `<draw:image xlink:href="…">` | `![](src)`                             |
| `<draw:frame>`                | unwrapped — a positioning wrapper      |
| `<text:line-break/>`          | a hard break                           |
| `<text:s text:c="N"/>`        | N literal spaces, bypassing collapsing |
| `<text:tab/>`                 | a single space                         |

```xml
<text:p><text:a xlink:href="https://example.com">site</text:a></text:p>
<text:p><draw:frame><draw:image xlink:href="pic.png"/></draw:frame></text:p>
<text:p>a<text:s text:c="3"/>b</text:p>
```

```
[site](https://example.com)

![](pic.png)

a   b
```

`<text:s>` is ODF's way of encoding runs of literal spaces that XML whitespace collapsing would
otherwise eat, so it is built directly as a text node rather than going through the normalizer.

## Tables

`<table:table>` becomes an `md:table`, flattening every cell to plain text — same constraint as
docx.

```xml
<table:table>
  <table:table-row>
    <table:table-cell><text:p>a</text:p></table:table-cell>
    <table:table-cell><text:p>b</text:p></table:table-cell>
  </table:table-row>
  <table:table-row>
    <table:table-cell><text:p>1</text:p></table:table-cell>
    <table:table-cell><text:p>2</text:p></table:table-cell>
  </table:table-row>
</table:table>
```

```
|a|b|
|:-|:-|
|1|2|
```

## Style resolution

```ts
import { odtStyleResolver, odtStyleTable } from "@bearmetal/clawmark/profiles/odt";

const table = odtStyleTable(stylesXml, contentXml);
table.resolve("T2"); // { named: "T2", bold: true, italic: true }
```

`odtStyleTable` walks both sources for `<style:style>` elements, keying on `style:name` and chaining
through `style:parent-style-name`. `odtStyleResolver().own(el, table)` reads an element's
`text:style-name` and resolves it.

## Exports

```ts
import {
	DRAW_NS,
	FO_NS,
	ODT_NS, // the full prefix -> URI map
	odtListStyles, // -> Map<styleName, Map<level, "ordered" | "unordered">>
	odtProfile,
	odtStyleResolver,
	odtStyleTable,
	OFFICE_NS,
	STYLE_NS,
	TABLE_NS,
	TEXT_NS,
	XLINK_NS,
} from "@bearmetal/clawmark/profiles/odt";
```

`ODT_NS` is what makes `on("text:p", ODT_NS)` resolve to the right URI — pass it to
[`scopedOn`](../dsl#scopedon-nsmap) when writing rules of your own.

## Extending

`parts.rules` is consulted **before** the built-ins:

```ts
import { on, scopedOn } from "@bearmetal/clawmark";
import { ODT_NS, odtProfile } from "@bearmetal/clawmark/profiles/odt";

const t = scopedOn(ODT_NS);

odtProfile({
	styles,
	rules: [
		// a template's "Callout" paragraph style becomes a blockquote
		t("text:p").whereStyle((s) => s.named === "Callout").wrap("md:blockquote", { phase: "open" }),
		// discard footnote bodies rather than inlining them
		t("text:note").drop(),
	],
});
```
