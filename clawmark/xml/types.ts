/**
 * @module
 * Node model for the portable XML/HTML parser. Deliberately structural rather
 * than class-based so a live DOM `Element` can be adapted into the same shape
 * (see dom.ts) and so the whole tree stays JSON-inspectable in tests.
 */

export type XmlNode = XmlElement | XmlText | XmlCData | XmlComment | XmlPI | XmlDoctype;

export interface XmlElement {
	kind: "element";
	/**
	 * Local name with any namespace prefix stripped, lowercased in html mode.
	 * This is what the crawler buckets its rule registry on - prefixes are not
	 * stable across producers, local names are.
	 */
	name: string;
	/** Namespace prefix exactly as written ("w" from "w:p"), if any. */
	prefix?: string;
	/** Namespace URI the prefix resolved to, if it was bound in scope. */
	ns?: string;
	/** The qualified name as written. Needed to re-serialize verbatim. */
	qname: string;
	/** Keyed by qualified name as written: "w:val", "href", "xmlns:w". */
	attrs: Map<string, string>;
	children: XmlNode[];
	parent?: XmlElement;
	selfClosing?: boolean;
}

export interface XmlText {
	kind: "text";
	value: string;
	parent?: XmlElement;
}

export interface XmlCData {
	kind: "cdata";
	value: string;
	parent?: XmlElement;
}

export interface XmlComment {
	kind: "comment";
	value: string;
	parent?: XmlElement;
}

export interface XmlPI {
	kind: "pi";
	target: string;
	value: string;
	parent?: XmlElement;
}

export interface XmlDoctype {
	kind: "doctype";
	value: string;
	parent?: XmlElement;
}

/**
 * Attribute spec accepted by the builders in build.ts. `undefined` and `false`
 * mean "omit this attribute", so an emitter can inline an optional value
 * without a conditional around it.
 */
export type AttrMap = Record<string, string | number | boolean | undefined>;

export type XmlMode = "xml" | "html";

export interface XmlParseOptions {
	/**
	 * "xml" (default) is strict and case-sensitive with namespace tracking.
	 * "html" folds names to lowercase, honors void/raw-text elements and the
	 * implicit-close table, tolerates unquoted attributes and stray `<`, and
	 * skips namespace resolution entirely.
	 */
	mode?: XmlMode;
	/** Extra named entities, merged over the built-in table. */
	entities?: Record<string, string>;
	/** Keep comment nodes in the tree. Default false. */
	preserveComments?: boolean;
	/** Called for every recovered error. Default: recover silently. */
	onError?(err: XmlParseError): void;
	/** Throw on the first error instead of recovering. Default false. */
	strict?: boolean;
}

export interface XmlParseError {
	code:
		| "stray-close"
		| "unclosed"
		| "mismatched"
		| "unquoted-attr"
		| "duplicate-attr"
		| "bad-entity"
		| "eof-in-tag";
	message: string;
	offset: number;
	line: number;
	column: number;
}

/** Root element name used for the synthetic document node. */
export const DOCUMENT_NAME = "#document";
