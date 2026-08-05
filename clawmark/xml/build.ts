/**
 * @module
 * Builders for the XML node model.
 *
 * `parser.ts` produces an `XmlNode` tree from text and `serialize.ts` turns one
 * back into text; nothing until now *constructed* one. A write profile
 * assembles its output as an `XmlNode` tree and hands it to `serializeXml`, so
 * every emitter needs a terse way to say "an element with these attributes and
 * these children".
 *
 * Same portability contract as the rest of `xml/`: no DOM, no host APIs.
 */

import type { AttrMap, XmlCData, XmlComment, XmlElement, XmlNode, XmlText } from "./types.ts";

/** The declaration every OOXML and ODF part opens with. */
export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * Builds an element from a qualified name.
 *
 * The `prefix`/`name` split mirrors what `on()` does in dsl.ts: the local name
 * is what everything buckets on, the prefix is kept verbatim so the output
 * re-serializes as written, and `nsMap` (when supplied) resolves the prefix to
 * a URI so a crawler reading this tree back sees the same namespace the parser
 * would have given it.
 *
 * Attributes whose value is `undefined` or `false` are skipped, so an emitter
 * can write `{ "w:val": node.data.lang }` without a conditional around it.
 * `selfClosing` is set unconditionally; `serializeXml` only honors it when the
 * element ends up with no children, so appending later is safe.
 */
export function el(
	qname: string,
	attrs: AttrMap = {},
	children: XmlNode[] = [],
	nsMap?: Record<string, string>,
): XmlElement {
	const colon = qname.indexOf(":");
	const prefix = colon > 0 ? qname.slice(0, colon) : undefined;
	const name = colon > 0 ? qname.slice(colon + 1) : qname;

	const element: XmlElement = {
		kind: "element",
		name,
		qname,
		attrs: new Map(),
		children: [],
		selfClosing: true,
	};
	if (prefix !== undefined) {
		element.prefix = prefix;
		const uri = nsMap?.[prefix];
		if (uri !== undefined) element.ns = uri;
	}

	for (const [key, value] of Object.entries(attrs)) {
		if (value === undefined || value === false) continue;
		element.attrs.set(key, value === true ? "" : String(value));
	}

	append(element, ...children);
	return element;
}

export function txt(value: string): XmlText {
	return { kind: "text", value };
}

export function cdata(value: string): XmlCData {
	return { kind: "cdata", value };
}

export function comment(value: string): XmlComment {
	return { kind: "comment", value };
}

/** Appends children to `parent`, wiring their `parent` links. Returns `parent`. */
export function append(parent: XmlElement, ...children: XmlNode[]): XmlElement {
	for (const child of children) {
		child.parent = parent;
		parent.children.push(child);
	}
	return parent;
}

/**
 * Stamps `xmlns:` declarations onto an element, and resolves its own prefix
 * against them if it did not already have a URI.
 *
 * Office roots declare a dozen namespaces they never use; the profiles pass
 * their whole `nsMap` here rather than curating a minimal set, matching what
 * real producers write.
 */
export function declareNamespaces(
	element: XmlElement,
	nsMap: Record<string, string>,
): XmlElement {
	for (const [prefix, uri] of Object.entries(nsMap)) {
		element.attrs.set(prefix === "" ? "xmlns" : `xmlns:${prefix}`, uri);
	}
	if (element.ns === undefined && element.prefix !== undefined) {
		const uri = nsMap[element.prefix];
		if (uri !== undefined) element.ns = uri;
	}
	return element;
}
