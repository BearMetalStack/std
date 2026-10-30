import type { XmlDomResult, XmlElement, XmlNode, XmlToDomOptions } from "./types.ts";
import { DOCUMENT_NAME } from "./types.ts";

/**
 * Builds `XmlElement` trees into live DOM - the mirror of {@link fromDom}.
 *
 * Elements are created directly rather than serialized and re-parsed, so the
 * returned `map` keeps the correspondence between what was written and what
 * appeared, and nothing here needs an HTML parser: it runs as-is against
 * `@bearmetal/slag`. An element with a namespace is created in it. A document
 * root (as `parseXml` returns, or `fromDom`) contributes only its children.
 * Processing instructions and doctypes are skipped.
 */
export function xmlToDom(
	nodes: XmlNode | readonly XmlNode[],
	doc: Document = globalThis.document,
	options: XmlToDomOptions = {},
): XmlDomResult {
	if (!doc) throw new Error("xmlToDom requires a Document (no `document` in this environment)");
	const map = new WeakMap<XmlElement, Element>();
	const fragment = doc.createDocumentFragment();
	const list = Array.isArray(nodes) ? nodes : [nodes as XmlNode];
	for (const node of list) {
		if (node.kind === "element" && node.name === DOCUMENT_NAME) {
			for (const child of node.children) build(child, fragment, doc, map, options);
		} else {
			build(node, fragment, doc, map, options);
		}
	}
	return { fragment, map };
}

function build(
	node: XmlNode,
	parent: Node,
	doc: Document,
	map: WeakMap<XmlElement, Element>,
	options: XmlToDomOptions,
): void {
	switch (node.kind) {
		case "element": {
			const el = node.ns ? doc.createElementNS(node.ns, node.qname) : doc.createElement(node.qname);
			for (const [name, value] of node.attrs) el.setAttribute(name, value);
			options.onElement?.(el, node);
			for (const child of node.children) build(child, el, doc, map, options);
			map.set(node, el);
			parent.appendChild(el);
			return;
		}
		case "text":
		case "cdata":
			parent.appendChild(doc.createTextNode(node.value));
			return;
		case "comment":
			parent.appendChild(doc.createComment(node.value));
			return;
		default:
			return;
	}
}

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
