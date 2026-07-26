import { assertEquals } from "@std/assert";
import { parseHtml, parseXml, serializeXml } from "./mod.ts";
import type { XmlElement, XmlParseError, XmlText } from "./types.ts";

/** First element child of the synthetic document root. */
function first(root: XmlElement): XmlElement {
	return root.children.find((c) => c.kind === "element") as XmlElement;
}

function text(el: XmlElement): string {
	return el.children.map((c) => (c.kind === "text" || c.kind === "cdata" ? c.value : "")).join("");
}

function errorsOf(src: string, html = false): XmlParseError[] {
	const errs: XmlParseError[] = [];
	const parse = html ? parseHtml : parseXml;
	parse(src, { onError: (e) => errs.push(e) });
	return errs;
}

// ---- basics ---------------------------------------------------------------

Deno.test("parses a simple element with text", () => {
	const el = first(parseXml("<a>hi</a>"));
	assertEquals(el.name, "a");
	assertEquals(text(el), "hi");
});

Deno.test("nests elements and links parents", () => {
	const root = first(parseXml("<a><b>x</b></a>"));
	const b = root.children[0] as XmlElement;
	assertEquals(b.name, "b");
	assertEquals(b.parent, root);
});

Deno.test("self-closing element", () => {
	const el = first(parseXml("<a><b/></a>"));
	const b = el.children[0] as XmlElement;
	assertEquals(b.selfClosing, true);
	assertEquals(b.children.length, 0);
});

// ---- attributes -----------------------------------------------------------

Deno.test("attributes: double, single, and unquoted", () => {
	const el = first(parseHtml(`<a x="1" y='2' z=3>t</a>`));
	assertEquals(el.attrs.get("x"), "1");
	assertEquals(el.attrs.get("y"), "2");
	assertEquals(el.attrs.get("z"), "3");
});

Deno.test("valueless attribute is the empty string", () => {
	const el = first(parseHtml("<input disabled>"));
	assertEquals(el.attrs.get("disabled"), "");
});

Deno.test("unquoted attribute is an error in xml mode but still parses", () => {
	assertEquals(first(parseXml("<a x=1></a>")).attrs.get("x"), "1");
	assertEquals(errorsOf("<a x=1></a>").map((e) => e.code), ["unquoted-attr"]);
});

Deno.test("an unquoted value stops only at whitespace or >, so slashes are kept", () => {
	// Deliberate: this is what makes bare `href=http://x` work. It also means
	// `<a x=1/>` is x="1/" with no self-close, exactly as browsers read it.
	assertEquals(first(parseHtml("<a href=http://x>t</a>")).attrs.get("href"), "http://x");
	assertEquals(first(parseHtml("<a x=1/>t</a>")).attrs.get("x"), "1/");
});

Deno.test("duplicate attribute: first wins", () => {
	const el = first(parseXml(`<a x="1" x="2"/>`));
	assertEquals(el.attrs.get("x"), "1");
	assertEquals(errorsOf(`<a x="1" x="2"/>`).map((e) => e.code), ["duplicate-attr"]);
});

// ---- namespaces -----------------------------------------------------------

Deno.test("resolves a namespace prefix to its URI", () => {
	const el = first(parseXml(`<w:p xmlns:w="urn:w"><w:r/></w:p>`));
	assertEquals(el.name, "p");
	assertEquals(el.prefix, "w");
	assertEquals(el.ns, "urn:w");
	assertEquals((el.children[0] as XmlElement).ns, "urn:w");
});

Deno.test("default xmlns applies to unprefixed descendants", () => {
	const el = first(parseXml(`<doc xmlns="urn:d"><kid/></doc>`));
	assertEquals(el.ns, "urn:d");
	assertEquals((el.children[0] as XmlElement).ns, "urn:d");
});

Deno.test("inner rebinding of a prefix wins, and is scoped", () => {
	const root = first(parseXml(
		`<a xmlns:p="urn:1"><p:x/><b xmlns:p="urn:2"><p:y/></b><p:z/></a>`,
	));
	const [x, b, z] = root.children as XmlElement[];
	assertEquals(x.ns, "urn:1");
	assertEquals((b.children[0] as XmlElement).ns, "urn:2");
	assertEquals(z.ns, "urn:1");
});

Deno.test("unbound prefix is tolerated (docx fragments lack root declarations)", () => {
	const el = first(parseXml("<w:p/>"));
	assertEquals(el.name, "p");
	assertEquals(el.prefix, "w");
	assertEquals(el.ns, undefined);
	assertEquals(errorsOf("<w:p/>"), []);
});

// ---- comments, CDATA, PIs, doctype ----------------------------------------

Deno.test("comments are dropped by default and kept on request", () => {
	assertEquals(first(parseXml("<a><!-- x -->b</a>")).children.length, 1);
	const kept = first(parseXml("<a><!-- x -->b</a>", { preserveComments: true }));
	assertEquals(kept.children[0].kind, "comment");
});

Deno.test("CDATA content is not entity-decoded", () => {
	const el = first(parseXml("<a><![CDATA[&amp; <b>]]></a>"));
	assertEquals(text(el), "&amp; <b>");
});

Deno.test("XML declaration and processing instructions", () => {
	const root = parseXml(`<?xml version="1.0"?><a/>`);
	assertEquals(root.children[0].kind, "pi");
	assertEquals((root.children[0] as { target: string }).target, "xml");
});

Deno.test("doctype with an internal subset does not end at the inner >", () => {
	const root = parseXml(`<!DOCTYPE a [ <!ENTITY x "y"> ]><a/>`);
	assertEquals(root.children[0].kind, "doctype");
	assertEquals(first(root).name, "a");
});

// ---- entities -------------------------------------------------------------

Deno.test("named and numeric entities", () => {
	assertEquals(text(first(parseXml("<a>&amp;&lt;&gt;&quot;&apos;</a>"))), `&<>"'`);
	assertEquals(text(first(parseXml("<a>&#65;&#x42;</a>"))), "AB");
	assertEquals(text(first(parseXml("<a>&mdash;&nbsp;</a>"))), "— ");
});

Deno.test("C1 numeric references use the windows-1252 remap", () => {
	assertEquals(text(first(parseXml("<a>&#128;&#146;</a>"))), "€’");
});

Deno.test("invalid code points become the replacement character", () => {
	assertEquals(text(first(parseXml("<a>&#xD800;</a>"))), "�");
	assertEquals(text(first(parseXml("<a>&#x110000;</a>"))), "�");
});

Deno.test("unknown entity is left literal, never dropped", () => {
	assertEquals(text(first(parseXml("<a>&bogus;</a>"))), "&bogus;");
	assertEquals(errorsOf("<a>&bogus;</a>").map((e) => e.code), ["bad-entity"]);
});

Deno.test("caller-supplied entities extend the table", () => {
	const el = first(parseXml("<a>&foo;</a>", { entities: { foo: "!" } }));
	assertEquals(text(el), "!");
});

Deno.test("entities are decoded in attribute values", () => {
	assertEquals(first(parseXml(`<a t="a&amp;b"/>`)).attrs.get("t"), "a&b");
});

// ---- error recovery -------------------------------------------------------

Deno.test("stray close tag is ignored, not structure-destroying", () => {
	const el = first(parseXml("<a>x</b>y</a>"));
	assertEquals(text(el), "xy");
	assertEquals(errorsOf("<a>x</b>y</a>").map((e) => e.code), ["stray-close"]);
});

Deno.test("mismatched close pops the intervening element", () => {
	const a = first(parseXml("<a><b><i>x</b></a>"));
	assertEquals((a.children[0] as XmlElement).name, "b");
	assertEquals(errorsOf("<a><b><i>x</b></a>").map((e) => e.code), ["mismatched"]);
});

Deno.test("unclosed elements are closed at EOF", () => {
	const a = first(parseXml("<a><b>x"));
	assertEquals(text(a.children[0] as XmlElement), "x");
	assertEquals(errorsOf("<a><b>x").map((e) => e.code), ["unclosed", "unclosed"]);
});

Deno.test("strict mode throws instead of recovering", () => {
	let threw = false;
	try {
		parseXml("<a>x</b></a>", { strict: true });
	} catch {
		threw = true;
	}
	assertEquals(threw, true);
});

// ---- html mode ------------------------------------------------------------

Deno.test("html: tag and attribute names fold to lowercase", () => {
	const el = first(parseHtml(`<DIV CLASS="x">t</DIV>`));
	assertEquals(el.name, "div");
	assertEquals(el.attrs.get("class"), "x");
});

Deno.test("html: void elements need no close tag", () => {
	const p = first(parseHtml("<p>a<br>b</p>"));
	assertEquals(p.children.length, 3);
	assertEquals((p.children[1] as XmlElement).name, "br");
});

Deno.test("html: script content is raw, even containing markup", () => {
	const s = first(parseHtml("<script>if (a<b) x = '</div>';</script>"));
	assertEquals(s.name, "script");
	assertEquals(text(s), "if (a<b) x = '</div>';");
});

Deno.test("html: script content is not entity-decoded", () => {
	assertEquals(text(first(parseHtml("<script>a &amp; b</script>"))), "a &amp; b");
});

Deno.test("html: textarea is raw but entity-decoded", () => {
	assertEquals(text(first(parseHtml("<textarea>a &amp; b</textarea>"))), "a & b");
});

Deno.test("html: implicit close of p and li", () => {
	const root = parseHtml("<p>a<p>b");
	const ps = root.children.filter((c) => c.kind === "element") as XmlElement[];
	assertEquals(ps.length, 2);
	assertEquals(text(ps[0]), "a");
	assertEquals(text(ps[1]), "b");
});

Deno.test("html: a nested ul does not let an inner li close the outer item", () => {
	const ul = first(parseHtml("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>"));
	const items = ul.children.filter((c) => c.kind === "element") as XmlElement[];
	assertEquals(items.length, 2);
	assertEquals(items[0].children.filter((c) => c.kind === "element").length, 1);
});

Deno.test("html: table rows and cells close implicitly", () => {
	const tr = first(parseHtml("<tr><td>a<td>b</tr>"));
	const cells = tr.children.filter((c) => c.kind === "element") as XmlElement[];
	assertEquals(cells.map((c) => text(c)), ["a", "b"]);
});

Deno.test("html: a lone < that cannot start a tag is literal text", () => {
	assertEquals(text(first(parseHtml("<p>a < b</p>"))), "a < b");
});

Deno.test("html mode does not resolve namespaces", () => {
	assertEquals(first(parseHtml(`<a xmlns="urn:x"/>`)).ns, undefined);
});

// ---- serialization --------------------------------------------------------

Deno.test("serializeXml round-trips a document", () => {
	const src = `<a x="1"><b>t&amp;t</b><c/></a>`;
	assertEquals(serializeXml(parseXml(src)), src);
});

Deno.test("serializeXml escapes attribute quotes", () => {
	const el = parseXml(`<a t="say &quot;hi&quot;"/>`);
	assertEquals(serializeXml(el), `<a t="say &quot;hi&quot;"/>`);
});

// ---- adjacency ------------------------------------------------------------

Deno.test("text split by an entity becomes one text node", () => {
	const el = first(parseXml("<a>x&amp;y</a>"));
	assertEquals(el.children.length, 1);
	assertEquals((el.children[0] as XmlText).value, "x&y");
});
