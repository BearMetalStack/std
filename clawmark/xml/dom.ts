import type { XmlElement, XmlNode } from "./types.ts";
import { DOCUMENT_NAME } from "./types.ts";

/**
 * Adapts a live DOM node into an `XmlElement` tree.
 *
 * This copies eagerly - the result is a snapshot, not a view. A lazy adapter
 * would have to fake the `attrs` Map, and every consumer would then have to
 * tiptoe around which Map methods actually work. For the tree sizes clawmark
 * deals with, an eager copy is the better trade.
 *
 * Importing this module is safe in a runtime with no DOM; only *calling* it
 * requires real nodes.
 */
export function fromDom(source: Element | Document | DocumentFragment): XmlElement {
	const root: XmlElement = {
		kind: "element",
		name: DOCUMENT_NAME,
		qname: DOCUMENT_NAME,
		attrs: new Map(),
		children: [],
	};

	if (isElement(source)) {
		const el = convertElement(source, root);
		root.children.push(el);
		return root;
	}

	for (const child of Array.from(source.childNodes)) {
		const node = convertNode(child, root);
		if (node) root.children.push(node);
	}
	return root;
}

function isElement(node: unknown): node is Element {
	return typeof node === "object" && node !== null && (node as Node).nodeType === 1;
}

function convertElement(el: Element, parent?: XmlElement): XmlElement {
	const attrs = new Map<string, string>();
	for (const attr of Array.from(el.attributes)) attrs.set(attr.name, attr.value);

	const out: XmlElement = {
		kind: "element",
		name: el.localName,
		qname: el.tagName,
		attrs,
		children: [],
		parent,
	};
	if (el.prefix) out.prefix = el.prefix;
	if (el.namespaceURI) out.ns = el.namespaceURI;

	for (const child of Array.from(el.childNodes)) {
		const node = convertNode(child, out);
		if (node) out.children.push(node);
	}
	return out;
}

function convertNode(node: Node, parent: XmlElement): XmlNode | undefined {
	switch (node.nodeType) {
		case 1:
			return convertElement(node as Element, parent);
		case 3:
			return { kind: "text", value: node.nodeValue ?? "", parent };
		case 4:
			return { kind: "cdata", value: node.nodeValue ?? "", parent };
		case 8:
			return { kind: "comment", value: node.nodeValue ?? "", parent };
		default:
			return undefined;
	}
}
