# Writing

The read direction turns markup into a tree. The write direction turns a tree back into markup — any
markup, not just the HTML that `Renderer` hardcodes.

```ts
import { convert, markdownWith, renderWith } from "@bearmetal/clawmark";
import { docxWriter } from "@bearmetal/clawmark/profiles/docx";

renderWith(tree, docxWriter()); // a tree you already have
markdownWith("# Hello", docxWriter()); // parse and write in one step
convert(contentXml, odtProfile(), docxWriter()); // read one format, write another
```

## Why this is a third direction

`Rule.renderOpen` returns an HTML string and takes no format parameter. That is fine for HTML and
fine for markdown — one rule can own both, because both are things markdown _is_. It does not
generalize: a heading is `<h2>`, `<w:pStyle w:val="Heading2"/>`, or
`<text:h text:outline-level="2">`, and no single rule should have to know all three.

So the write direction belongs to the **profile**, exactly as the read direction's matchers do. A
`WriteProfile` is the mirror of `Profile`, and an `Emitter` claims a node tag the way a
`ReverseRule` claims an element name. Precedence is position in the array, memoized per tag — the
same rule as everywhere else in clawmark.

Read and write profiles are separate objects. A reader is configured with the source parts it was
handed; a writer with how the output should look. Nothing useful is shared between those.

## Emitters

```ts
import { out } from "@bearmetal/clawmark/dsl";

out("md:heading").wrap("text:h", (node) => ({ "text:outline-level": node.data.level }));
out("md:bold").style({ bold: true });
out("md:tablerow").drop();
out("md:link").to((node, ctx) => ({ kind: "nodes", nodes: [buildLink(node, ctx)] }));
```

`out()` is the mirror of `on()`, down to the shape of the chain: `where*` methods return the
builder, terminal verbs return the emitter.

| Terminal             | Result                                              |
| -------------------- | --------------------------------------------------- |
| `wrap(qname, attrs)` | `<qname>` with the node's children inside           |
| `leaf(qname, attrs)` | `<qname>` with no children; the subtree is consumed |
| `chain(qnames)`      | Nested elements, children in the innermost          |
| `style(spec)`        | No element: a style frame, plus the children        |
| `unwrap()`           | Children only, into the current parent              |
| `drop()`             | Nothing                                             |
| `to(fn)`             | Full control; return `null` to decline              |

Predicates are `where`, `whereData`, `whereParent`, `whereStyle`, `whereAncestor`, `whereNot`, and
`named` for a readable id. `outAny()` registers in the wildcard bucket; `outStyle(pred)` is sugar
for `outAny().whereStyle(pred)`.

## The style frame stack

This is the one piece with no counterpart on the read side, and it is what makes the office formats
tractable.

A clawmark tree nests. `**b *c* d**` is `md:bold > (text, md:italic > text, text)`. A docx run does
not nest: `<w:b/>` and `<w:i/>` are siblings inside one `<w:rPr>`. Neither does a docx _block_ — a
blockquote is a run of `<w:p>` carrying the Quote style, and a list is a run of `<w:p>` carrying
`<w:numPr>`.

So an emitter that represents formatting rather than structure returns `{ kind: "style" }` and emits
no element at all. Its style merges onto `ctx.style` for the whole subtree, and whichever emitter
does produce an element reads the accumulated total:

```ts
out("md:blockquote").style({ blockRole: "quote" });
out("md:bold").style({ bold: true });

out("core:paragraph").to((_node, ctx) => ({
	kind: "element",
	el: paragraph(ctx, { styleId: blockStyleId(ctx.style) }), // "Quote" here
}));
```

Frames merge with `mergeStyle`, so an inner `false` overrides an outer `true` — the same rule the
read side's ancestor cascade follows. This is the exact inverse of `emphasisTags()`, which the read
profiles use to turn one resolved style back into a chain of nested tags.

ODF spans _do_ nest, so `odtWriter` emits a real `<text:span>` per emphasis node instead. The
difference between the two writers here is a property of the formats, not a stylistic choice.

## `EmitResult`

```ts
| { kind: "element"; el: XmlElement; into?: XmlElement }
| { kind: "nodes"; nodes: XmlNode[] }
| { kind: "style"; style: ResolvedStyle }
| { kind: "unwrap" }
| { kind: "drop" }
| { kind: "custom"; run(parent: XmlElement, ctx: EmitContext): void }
```

`into` exists because office elements are chains whose children belong at the bottom, not the top: a
docx paragraph is `<w:p><w:pPr>…</w:pPr>` with the content _after_ the properties. Without it every
such emitter would fall through to `custom`.

`custom` is for the shapes nothing else expresses — chiefly a list item, whose inline content goes
into its own paragraph while a nested list under it goes to the item's _parent_.

A node tag no emitter claims follows the `unclaimed` policy: `unwrap` (default), `drop`, `text`, or
a callback. `core:text` is the exception — it has a core fallback that emits a text node, because
the default policy would otherwise discard every character in the document without saying anything.

## Sinks

`StyleSink` is the inverse of `StyleTable`: hand it a normalized style, get back the name a document
should reference for it, deduped on a canonical key.

```ts
const styles = createStyleSink({
	prefix: { text: "T", list: "L" },
	name: (style) => style.blockRole === "heading" ? `Heading_20_${style.headingLevel}` : undefined,
});
styles.ensure({ bold: true }, "text"); // "T1"
styles.ensure({ bold: true }, "text"); // "T1" again
```

odt needs this for everything, because ODF expresses even direct formatting as a named automatic
style, and two identically bold spans must share one definition or the file grows one
`<style:style>` per run. docx needs it only for list numbering.

`ResourceSink` mints ids for targets a format references indirectly. docx serializes its entries
into `word/_rels/document.xml.rels`; odt writes `xlink:href` inline and ignores it.

Both are populated _during_ the walk and read _after_ it, which is why `assemble` runs last.

## `assemble` and `WriteResult`

A write pass produces a package as a set of named parts. `assemble` receives the emitted body and
everything the walk interned, and turns it into the finished set:

```ts
interface WriteResult {
	parts: Record<string, string>; // part path -> contents
	primary: string; // key of the main document part
	extension?: string;
	mediaType?: string;
	warnings: string[];
}
```

For a format that is one document and no boilerplate, `singlePart(path, options)` is the whole
implementation.

**Nothing here is zipped.** A ZIP implementation would be the only binary code in clawmark, so the
boundary is the same in both directions — callers hand parts in, and get parts back out. For odt,
note that the `mimetype` entry must be stored **first and uncompressed**, which is a property of the
archive rather than of the bytes:

```sh
zip -X -0 out.odt mimetype && zip -X -r out.odt . -x mimetype
```

## Conversion is normalization

The tree carries no source-format context. That is what makes `convert()` useful and what limits it:

```ts
convert(malformedContentXml, odtProfile({ styles }), odtWriter());
```

A document from an exporter that plays fast and loose with the spec comes back out built to spec —
Google Docs writes headings as `<text:p>` with a heading style and an empty
`style:default-outline-level`, and what comes out is a real `<text:h text:outline-level="1">` — not
because anything repaired it, but because the writer builds from the normalized tree and has no idea
what the input looked like.

The corollary is that anything the node vocabulary and `ResolvedStyle` cannot express is dropped on
the way through. Round-trip fidelity is covered in the package README.

## Writing a new format

```ts
import { out, singlePart, type WriteProfile } from "@bearmetal/clawmark";

export function myWriter(): WriteProfile {
	return {
		name: "mine",
		nsMap: { my: "https://example.com/ns" },
		emitters: [
			out("core:paragraph").wrap("my:para"),
			out("md:heading").wrap("my:title", (node) => ({ level: node.data.level })),
			out("md:bold").style({ bold: true }),
		],
		assemble: singlePart("doc.xml", { extension: "myx" }),
	};
}
```

Emitters key on node tags, and the tags are whatever rule set is in play — nothing about a write
profile is markdown-specific. Emitters should take ids in the `out:` namespace, which the DSL does
for you, for the same reason reverse-only rules take `rev:` ids.
