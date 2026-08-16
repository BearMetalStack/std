# The XML/HTML parser

```ts
import { parseHtml, parseXml, serializeXml, XmlParser } from "@bearmetal/clawmark/xml";
```

A portable, zero-dependency XML/HTML parser. It backs the reverse pipeline, but it stands alone —
nothing in it knows what markdown is.

**One tokenizer serves both grammars via a mode flag.** The HTML quirks (void elements, raw-text
elements, implicit close, case folding, unquoted attributes) are additive lookup tables, not a
different parse strategy. No `DOMParser`, no `Deno.*`, no `globalThis`: it runs the same in Deno, a
browser, and a worker.

## Parsing

```ts
parseXml("<a>hi</a>"); // strict, case-sensitive, namespace-aware
parseHtml("<p>a<br>b"); // lenient, lowercased, void-aware
new XmlParser(src, { mode: "html" }).parse();
```

All three return a **synthetic `#document` root**, not "the single root element". Fragments
legitimately have many top-level nodes, and every caller would otherwise have to special-case that.

```ts
const root = parseXml("<a>hi</a>");
root.name; // "#document"
const a = root.children.find((c) => c.kind === "element");
```

### Options

```ts
interface XmlParseOptions {
	mode?: "xml" | "html"; // default "xml"
	entities?: Record<string, string>; // extra named entities, merged over the built-ins
	preserveComments?: boolean; // default false
	onError?(err: XmlParseError): void; // default: recover silently
	strict?: boolean; // throw on the first error. default false
}
```

## The node model

Deliberately structural rather than class-based, so a live DOM `Element` can be adapted into the
same shape and the whole tree stays JSON-inspectable in tests.

```ts
type XmlNode = XmlElement | XmlText | XmlCData | XmlComment | XmlPI | XmlDoctype;

interface XmlElement {
	kind: "element";
	name: string; // local name, prefix stripped, lowercased in html mode
	prefix?: string; // "w" from "w:p"
	ns?: string; // the URI the prefix resolved to, if bound in scope
	qname: string; // as written — needed to re-serialize verbatim
	attrs: Map<string, string>; // keyed by qualified name: "w:val", "href", "xmlns:w"
	children: XmlNode[];
	parent?: XmlElement;
	selfClosing?: boolean;
}
```

`name` is the local name because that is what is stable — prefixes are not, across producers.
`qname` and `attrs`' qualified keys keep enough to serialize back out unchanged.

The leaf kinds carry a `value` (`text`, `cdata`, `comment`, `doctype`) or a `target` plus `value`
(`pi`).

## Namespaces (xml mode)

Prefixes resolve through a scoped stack, so inner rebinding wins and is properly scoped:

```ts
const el = parseXml(`<w:p xmlns:w="urn:w"><w:r/></w:p>`);
// name "p", prefix "w", ns "urn:w" — and the child inherits the binding

parseXml(`<doc xmlns="urn:d"><kid/></doc>`);
// a default xmlns applies to unprefixed descendants

parseXml(`<a xmlns:p="urn:1"><p:x/><b xmlns:p="urn:2"><p:y/></b><p:z/></a>`);
// p:x -> urn:1, p:y -> urn:2, p:z -> urn:1 again
```

**An unbound prefix is tolerated, not an error.** docx and odt fragments are routinely handed over
without their root declarations, and rejecting them would make the office profiles useless on real
input:

```ts
const el = parseXml("<w:p/>");
// name "p", prefix "w", ns undefined — and no error reported
```

HTML mode does not resolve namespaces at all.

## Entities

```ts
parseXml("<a>&amp;&lt;&gt;&quot;&apos;</a>"); // & < > " '
parseXml("<a>&#65;&#x42;</a>"); // AB
parseXml("<a>&mdash;&nbsp;</a>"); // — and a non-breaking space
```

- Numeric references in the C1 range use the **windows-1252 remap**, so `&#128;` is `€` and `&#146;`
  is `’` — which is what real-world documents mean by them.
- Invalid code points (surrogates, beyond `0x10FFFF`) become `U+FFFD`.
- An **unknown entity is left literal, never dropped**: `&bogus;` stays `&bogus;` and reports a
  `bad-entity` error.
- Entities are decoded in attribute values too.
- Text split by an entity coalesces into a single text node.

The built-in table is the ~200 entities that actually turn up in HTML, OOXML and ODF output, not the
full 2,231-entry HTML5 set — that would be ~30kB of source in a package whose whole pitch is being
small. Extend it when you need more:

```ts
parseXml("<a>&foo;</a>", { entities: { foo: "!" } }); // "!"
```

```ts
import { decodeEntities, namedEntities } from "@bearmetal/clawmark/xml";

decodeEntities("a &amp; b"); // "a & b"
namedEntities; // the built-in table
```

## Error recovery

Parsing **recovers by default** and reports through `onError`. Set `strict: true` to throw on the
first problem instead.

```ts
const errors: XmlParseError[] = [];
parseXml(src, { onError: (e) => errors.push(e) });
// each: { code, message, offset, line, column }
```

| Code             | Recovery                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| `stray-close`    | Ignored. `<a>x</b>y</a>` yields text `"xy"`, structure intact.              |
| `mismatched`     | Pops the intervening elements. `<a><b><i>x</b></a>` closes `<i>` and `<b>`. |
| `unclosed`       | Closed at EOF, one error per open element.                                  |
| `unquoted-attr`  | Value still parsed. An error in xml mode; normal in html mode.              |
| `duplicate-attr` | First occurrence wins.                                                      |
| `bad-entity`     | Left literal.                                                               |
| `eof-in-tag`     | Input ended inside a tag, or on a lone `<`. The partial tag is abandoned.   |

Recovery is the default because the parser's job is to get something usable out of documents it did
not produce — an office export or a pasted fragment is routinely malformed, and refusing to parse it
helps nobody.

## HTML mode

Everything below is what the mode flag switches on, and all of it lives in exported lookup tables.

### Case folding

```ts
parseHtml(`<DIV CLASS="x">t</DIV>`); // name "div", attrs { class: "x" }
```

### Void elements

Never have children, never need a closing tag.

```ts
import { VOID } from "@bearmetal/clawmark/xml";
// area base br col embed hr img input link meta param source track wbr

parseHtml("<p>a<br>b</p>"); // three children: text, <br>, text
```

### Raw-text elements

Content is scanned verbatim to the matching close tag.

```ts
import { ESCAPABLE_RAW, RAW_TEXT } from "@bearmetal/clawmark/xml";
// RAW_TEXT:       script, style        — not entity-decoded
// ESCAPABLE_RAW:  textarea, title      — entity-decoded

parseHtml("<script>if (a<b) x = '</div>';</script>");
// content: "if (a<b) x = '</div>';"

parseHtml("<script>a &amp; b</script>"); // "a &amp; b"  — left alone
parseHtml("<textarea>a &amp; b</textarea>"); // "a & b"      — decoded
```

### Implicit close

```ts
import { AUTO_CLOSE } from "@bearmetal/clawmark/xml";

parseHtml("<p>a<p>b"); // two sibling paragraphs
parseHtml("<tr><td>a<td>b"); // two sibling cells
```

`AUTO_CLOSE` checks only the **top** of the stack, not "nearest in scope". That is what keeps a
nested `<ul>` from letting an inner `<li>` close the outer item — the `<ul>` sits between them:

```ts
parseHtml("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
// the outer <ul> has exactly two items, and the first contains the nested list
```

### Attribute leniency

```ts
parseHtml(`<a x="1" y='2' z=3>t</a>`); // all three parse
parseHtml("<input disabled>"); // valueless attribute is ""
parseHtml("<a href=http://x>t</a>"); // unquoted values stop at whitespace or >
parseHtml("<a x=1/>t</a>"); // so this is x="1/", with no self-close
parseHtml("<p>a < b</p>"); // a lone < that can't start a tag is text
```

The unquoted-value rule is deliberate — stopping at `/` would break bare `href=http://x`, which is
far more common in real HTML than a self-closed unquoted attribute. Browsers read it the same way.

### PRE_ELEMENTS

```ts
import { PRE_ELEMENTS } from "@bearmetal/clawmark/xml";
```

Elements whose content the _crawler_ treats as pre-formatted. Not used by the parser itself, but
exported alongside the other tables since it belongs to the same body of HTML knowledge.

## Comments, CDATA, PIs, doctype

```ts
parseXml("<a><!-- x -->b</a>"); // comment dropped
parseXml("<a><!-- x -->b</a>", { preserveComments: true }); // kept as a comment node

parseXml("<a><![CDATA[&amp; <b>]]></a>"); // "&amp; <b>" — not decoded
parseXml(`<?xml version="1.0"?><a/>`); // a pi node, target "xml"
parseXml(`<!DOCTYPE a [ <!ENTITY x "y"> ]><a/>`); // internal subset handled
```

The doctype scanner tracks bracket depth, so an internal subset does not end at the first inner `>`.

## Live DOM input

```ts
import { fromDom } from "@bearmetal/clawmark/xml";

fromDom(document.body);
fromDom(someDocumentFragment);
```

Adapts a live `Element`, `Document`, or `DocumentFragment` into the same `XmlElement` tree. **It
copies eagerly** — the result is a snapshot, not a view. A lazy adapter would have to fake the
`attrs` Map, and every consumer would then have to tiptoe around which Map methods actually work.

Importing this module is safe in a runtime with no DOM; only _calling_ it requires real nodes.
`fromHtml` and `htmlToMarkdown` call it for you when handed a live node.

## Serializing

```ts
import { parseXml, serializeXml } from "@bearmetal/clawmark/xml";

const src = `<a x="1"><b>t&amp;t</b><c/></a>`;
serializeXml(parseXml(src)); // the same string back
```

```ts
serializeXml(node, mode?: "xml" | "html" | "xhtml")
```

Text and attribute values are escaped. In `"html"` mode void elements stay void instead of gaining a
closing tag — which is why the `raw` [unmatched policy](./reverse#unmatched-elements) passes the
profile's mode through.

`"xhtml"` produces markup that is both valid HTML and well-formed XML: void elements self-close
(`<br/>`, not `<br>`) and boolean attributes are written in their canonical minimized form
(`disabled="disabled"`, not the bare `disabled` HTML allows or the `disabled=""` plain `"xml"` mode
falls back to). It has no parsing counterpart — well-formed XHTML source already parses correctly
under `"xml"` mode, so there is nothing for a parser-side `"xhtml"` mode to do differently.
