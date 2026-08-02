import { NodeType } from "./node_type.ts";
import { SlagComment, SlagNode, SlagText } from "./node.ts";
import { SlagDocumentFragment } from "./fragment.ts";
import {
	HTML_NAMESPACE,
	SlagElement,
	SlagHTMLElement,
	SlagSVGElement,
	SlagTemplateElement,
	SVG_NAMESPACE,
} from "./element.ts";
import { customElementRegistry, withConstructingTag } from "./custom_elements.ts";
import type { SlagCSSStyleSheet } from "./css.ts";

/**
 * A document: the tree root, and the factory every node comes from.
 *
 * A node is "connected" when its shadow-including root is a document, so
 * appending to `document.body` is what makes custom element reactions fire —
 * the same rule as the browser, and the reason Slag has a real document object
 * rather than the bare `{ createElement }` literals it replaces.
 */
export class SlagDocument extends SlagNode {
	override readonly nodeType = NodeType.DOCUMENT_NODE;
	override readonly nodeName = "#document";

	readonly documentElement: SlagElement;
	readonly head: SlagElement;
	readonly body: SlagElement;

	adoptedStyleSheets: SlagCSSStyleSheet[] = [];

	constructor() {
		super();
		this.ownerDocument = this;
		this.documentElement = this.#create("html");
		this.head = this.#create("head");
		this.body = this.#create("body");
		this.documentElement.appendChild(this.head);
		this.documentElement.appendChild(this.body);
		this.appendChild(this.documentElement);
	}

	#create(tag: string): SlagHTMLElement {
		const element = new SlagHTMLElement(tag);
		element.ownerDocument = this;
		return element;
	}

	createElement(tagName: string): SlagElement {
		const tag = tagName.toLowerCase();
		const ctor = customElementRegistry.get(tag);
		const element = ctor
			? withConstructingTag(tag, () => new ctor())
			: tag === "template"
			? new SlagTemplateElement()
			: new SlagHTMLElement(tag);
		element.ownerDocument = this;
		return element;
	}

	createElementNS(namespaceURI: string | null, qualifiedName: string): SlagElement {
		if (namespaceURI === SVG_NAMESPACE) {
			const element = new SlagSVGElement(qualifiedName);
			element.ownerDocument = this;
			return element;
		}
		if (namespaceURI === null || namespaceURI === HTML_NAMESPACE) {
			return this.createElement(qualifiedName);
		}
		const element = new SlagElement(qualifiedName, namespaceURI);
		element.ownerDocument = this;
		return element;
	}

	createTextNode(data = ""): SlagText {
		const node = new SlagText(data);
		node.ownerDocument = this;
		return node;
	}

	createComment(data = ""): SlagComment {
		const node = new SlagComment(data);
		node.ownerDocument = this;
		return node;
	}

	createDocumentFragment(): SlagDocumentFragment {
		const fragment = new SlagDocumentFragment();
		fragment.ownerDocument = this;
		return fragment;
	}

	/** Re-homes a node onto this document. Slag has no cross-document rules. */
	adoptNode<T extends SlagNode>(node: T): T {
		node.remove();
		node.ownerDocument = this;
		return node;
	}

	importNode<T extends SlagNode>(node: T, deep = false): SlagNode {
		const clone = node.cloneNode(deep);
		clone.ownerDocument = this;
		return clone;
	}

	override cloneNode(): SlagDocument {
		throw new Error("Slag does not support cloning a document.");
	}
}
