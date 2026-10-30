import { assertEquals } from "@std/assert";
import { SlagDocument } from "@bearmetal/slag";
import { fromDom, parseHtml, parseXml, xmlToDom } from "./mod.ts";
import type { XmlElement } from "./types.ts";

const html = (fragment: DocumentFragment, doc: Document) => {
	const div = doc.createElement("div");
	div.appendChild(fragment);
	return div.innerHTML;
};

Deno.test("xmlToDom builds elements, attributes, text and comments", () => {
	const doc = new SlagDocument() as unknown as Document;
	const source = '<p class="a">one <strong>two</strong><!-- c --></p>';
	const { fragment } = xmlToDom(parseHtml(source, { preserveComments: true }), doc);
	assertEquals(html(fragment, doc), source);
});

Deno.test("xmlToDom maps each written element to the one it became", () => {
	const doc = new SlagDocument() as unknown as Document;
	const root = parseHtml("<p><em>x</em></p>");
	const p = root.children[0] as XmlElement;
	const em = p.children[0] as XmlElement;
	const { fragment, map } = xmlToDom(root, doc);
	assertEquals(map.get(p), fragment.firstChild);
	assertEquals(map.get(em), fragment.firstChild!.firstChild);
});

Deno.test("xmlToDom creates namespaced elements in their namespace", () => {
	const doc = new SlagDocument() as unknown as Document;
	const svg = "http://www.w3.org/2000/svg";
	const { fragment } = xmlToDom(parseXml(`<svg xmlns="${svg}"><g/></svg>`), doc);
	assertEquals((fragment.firstChild as Element).namespaceURI, svg);
	assertEquals((fragment.firstChild!.firstChild as Element).namespaceURI, svg);
});

Deno.test("xmlToDom lets a caller adjust each element", () => {
	const doc = new SlagDocument() as unknown as Document;
	const { fragment } = xmlToDom(parseHtml('<img src="a.png">'), doc, {
		onElement: (el) => el.setAttribute("src", "b.png"),
	});
	assertEquals(html(fragment, doc), '<img src="b.png">');
});

Deno.test("xmlToDom is the inverse of fromDom", () => {
	const doc = new SlagDocument() as unknown as Document;
	const source = '<ul><li>a <a href="x">b</a></li></ul>';
	const { fragment } = xmlToDom(parseHtml(source), doc);
	assertEquals(html(xmlToDom(fromDom(fragment), doc).fragment, doc), source);
});
