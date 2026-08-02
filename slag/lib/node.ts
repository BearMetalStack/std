/**
 * The node tree: `SlagNode` and the character-data leaves that live on it.
 *
 * The character-data classes share this module with `SlagNode` on purpose.
 * `append()`/`prepend()`/`replaceChildren()` accept bare strings and have to
 * turn them into text nodes, so the base class needs `SlagText` at runtime —
 * splitting them apart buys nothing but an import cycle.
 */

import { dispatchConnected, dispatchDisconnected } from "./custom_elements.ts";
import { serialize } from "./serialize.ts";
import { querySelector, querySelectorAll } from "./selector.ts";
import { NodeType } from "./node_type.ts";
import type { SlagDocument } from "./document.ts";
import type { SlagElement } from "./element.ts";

export { NodeType };

/** Anything insertable into the tree: a node, or a string that becomes a text node. */
export type SlagInsertable = SlagNode | string;

function isElement(node: SlagNode): node is SlagElement {
	return node.nodeType === NodeType.ELEMENT_NODE;
}

/** Walks to the top of `start`'s tree, hopping shadow root → host when composed. */
function rootOf(start: SlagNode, composed: boolean): SlagNode {
	let node = start;
	for (;;) {
		if (node.parentNode) {
			node = node.parentNode;
			continue;
		}
		const host = (node as { host?: SlagElement }).host;
		if (composed && host) {
			node = host;
			continue;
		}
		return node;
	}
}

/**
 * The tree node.
 *
 * ## Events come for free, and that shapes this class
 *
 * Deno's built-in `EventTarget` implements the *whole* DOM dispatch algorithm —
 * capture, bubbling, `stopPropagation`, `composedPath` — and switches it on for
 * any target that looks like a node, which it decides by checking for a
 * `nodeType` property and then walking `parentNode`. Extending `EventTarget` and
 * exposing those two members is therefore all Slag has to do to get real event
 * propagation; there is no hand-rolled dispatch here on purpose.
 *
 * The one thing that does not carry over: a `composed` event will not cross a
 * shadow boundary, because Deno tracks a shadow root's host in an internal slot
 * Slag cannot populate. Events dispatched inside a shadow root stop at the root.
 */
export abstract class SlagNode extends EventTarget {
	static readonly ELEMENT_NODE = NodeType.ELEMENT_NODE;
	static readonly TEXT_NODE = NodeType.TEXT_NODE;
	static readonly COMMENT_NODE = NodeType.COMMENT_NODE;
	static readonly DOCUMENT_NODE = NodeType.DOCUMENT_NODE;
	static readonly DOCUMENT_FRAGMENT_NODE = NodeType.DOCUMENT_FRAGMENT_NODE;

	readonly ELEMENT_NODE = NodeType.ELEMENT_NODE;
	readonly TEXT_NODE = NodeType.TEXT_NODE;
	readonly COMMENT_NODE = NodeType.COMMENT_NODE;
	readonly DOCUMENT_NODE = NodeType.DOCUMENT_NODE;
	readonly DOCUMENT_FRAGMENT_NODE = NodeType.DOCUMENT_FRAGMENT_NODE;

	abstract readonly nodeType: number;
	abstract readonly nodeName: string;

	parentNode: SlagNode | null = null;
	childNodes: SlagNode[] = [];
	ownerDocument: SlagDocument | null = null;

	// -- navigation --

	get parentElement(): SlagElement | null {
		const parent = this.parentNode;
		return parent && isElement(parent) ? parent : null;
	}

	/** Element-only view of `childNodes`, mirroring `ParentNode.children`. */
	get children(): SlagElement[] {
		return this.childNodes.filter(isElement);
	}

	get firstChild(): SlagNode | null {
		return this.childNodes[0] ?? null;
	}

	get lastChild(): SlagNode | null {
		return this.childNodes[this.childNodes.length - 1] ?? null;
	}

	get firstElementChild(): SlagElement | null {
		return this.children[0] ?? null;
	}

	get lastElementChild(): SlagElement | null {
		const elements = this.children;
		return elements[elements.length - 1] ?? null;
	}

	get childElementCount(): number {
		return this.children.length;
	}

	get nextSibling(): SlagNode | null {
		const siblings = this.parentNode?.childNodes;
		if (!siblings) return null;
		return siblings[siblings.indexOf(this) + 1] ?? null;
	}

	get previousSibling(): SlagNode | null {
		const siblings = this.parentNode?.childNodes;
		if (!siblings) return null;
		const index = siblings.indexOf(this);
		return index > 0 ? siblings[index - 1] : null;
	}

	get nextElementSibling(): SlagElement | null {
		let node = this.nextSibling;
		while (node && !isElement(node)) node = node.nextSibling;
		return node;
	}

	get previousElementSibling(): SlagElement | null {
		let node = this.previousSibling;
		while (node && !isElement(node)) node = node.previousSibling;
		return node;
	}

	hasChildNodes(): boolean {
		return this.childNodes.length > 0;
	}

	// -- queries --

	querySelector(selector: string): SlagElement | null {
		return querySelector(this, selector);
	}

	querySelectorAll(selector: string): SlagElement[] {
		return querySelectorAll(this, selector);
	}

	getElementById(id: string): SlagElement | null {
		return querySelector(this, `[id="${id}"]`);
	}

	contains(node: SlagNode | null): boolean {
		for (let current = node; current; current = current.parentNode) {
			if (current === this) return true;
		}
		return false;
	}

	/**
	 * The root of this node's tree. `composed` crosses shadow boundaries by
	 * hopping from a shadow root to its host, which is what makes
	 * {@linkcode isConnected} see through a shadow root.
	 */
	getRootNode(options?: { composed?: boolean }): SlagNode {
		return rootOf(this, options?.composed ?? false);
	}

	/** True when this node's shadow-including root is a document. */
	get isConnected(): boolean {
		return this.getRootNode({ composed: true }).nodeType === NodeType.DOCUMENT_NODE;
	}

	// -- mutation --

	/**
	 * Removes `node` from its parent without firing any reaction. Callers are
	 * responsible for deciding whether a disconnect happened — an insertion that
	 * moves a node within the same tree must not report one.
	 */
	#detach(node: SlagNode): void {
		const parent = node.parentNode;
		if (!parent) return;
		const index = parent.childNodes.indexOf(node);
		if (index !== -1) parent.childNodes.splice(index, 1);
		node.parentNode = null;
	}

	insertBefore<T extends SlagNode>(node: T, reference: SlagNode | null): T {
		if (reference && reference.parentNode !== this) {
			throw new Error(
				"Failed to execute 'insertBefore': the reference node is not a child of this node.",
			);
		}
		if ((node as SlagNode) === (this as SlagNode) || node.contains(this)) {
			throw new Error(
				"Failed to execute 'insertBefore': the new child contains the parent.",
			);
		}

		if (node.nodeType === NodeType.DOCUMENT_FRAGMENT_NODE) {
			for (const child of [...node.childNodes]) this.insertBefore(child, reference);
			return node;
		}

		const wasConnected = node.isConnected;
		this.#detach(node);
		if (wasConnected && !node.isConnected) dispatchDisconnected(node);

		const index = reference ? this.childNodes.indexOf(reference) : this.childNodes.length;
		this.childNodes.splice(index === -1 ? this.childNodes.length : index, 0, node);
		node.parentNode = this;
		node.ownerDocument ??= this.ownerDocument;
		if (this.isConnected) dispatchConnected(node);
		return node;
	}

	appendChild<T extends SlagNode>(node: T): T {
		return this.insertBefore(node, null);
	}

	removeChild<T extends SlagNode>(node: T): T {
		if (node.parentNode !== this) {
			throw new Error(
				"Failed to execute 'removeChild': the node to be removed is not a child of this node.",
			);
		}
		const wasConnected = node.isConnected;
		this.#detach(node);
		if (wasConnected) dispatchDisconnected(node);
		return node;
	}

	replaceChild<T extends SlagNode>(node: SlagNode, child: T): T {
		this.insertBefore(node, child);
		return this.removeChild(child);
	}

	append(...nodes: SlagInsertable[]): void {
		for (const node of nodes) this.insertBefore(this.#coerce(node), null);
	}

	prepend(...nodes: SlagInsertable[]): void {
		const first = this.firstChild;
		for (const node of nodes) this.insertBefore(this.#coerce(node), first);
	}

	replaceChildren(...nodes: SlagInsertable[]): void {
		for (const child of [...this.childNodes]) this.removeChild(child);
		for (const node of nodes) this.insertBefore(this.#coerce(node), null);
	}

	before(...nodes: SlagInsertable[]): void {
		const parent = this.parentNode;
		if (!parent) return;
		for (const node of nodes) parent.insertBefore(this.#coerce(node), this);
	}

	after(...nodes: SlagInsertable[]): void {
		const parent = this.parentNode;
		if (!parent) return;
		const reference = this.nextSibling;
		for (const node of nodes) parent.insertBefore(this.#coerce(node), reference);
	}

	replaceWith(...nodes: SlagInsertable[]): void {
		const parent = this.parentNode;
		if (!parent) return;
		this.before(...nodes);
		parent.removeChild(this);
	}

	remove(): void {
		this.parentNode?.removeChild(this);
	}

	#coerce(node: SlagInsertable): SlagNode {
		return typeof node === "string" ? new SlagText(node) : node;
	}

	// -- content --

	get textContent(): string {
		return this.childNodes.map((child) => child.textContent ?? "").join("");
	}

	set textContent(value: string | null) {
		for (const child of [...this.childNodes]) this.removeChild(child);
		if (value != null && value !== "") this.appendChild(new SlagText(value));
	}

	abstract cloneNode(deep?: boolean): SlagNode;

	/** Copies this node's children into `target`. Used by `cloneNode(true)`. */
	protected cloneChildrenInto(target: SlagNode): void {
		for (const child of this.childNodes) target.appendChild(child.cloneNode(true));
	}

	/** Serializes this node to HTML — the microdom's answer to `Html.toString()`. */
	override toString(): string {
		return serialize(this);
	}
}

// -- character data --

export abstract class SlagCharacterData extends SlagNode {
	data: string;

	constructor(data = "") {
		super();
		this.data = data;
	}

	override get textContent(): string {
		return this.data;
	}

	override set textContent(value: string | null) {
		this.data = value ?? "";
	}

	get nodeValue(): string {
		return this.data;
	}

	set nodeValue(value: string | null) {
		this.data = value ?? "";
	}

	get length(): number {
		return this.data.length;
	}

	override get children(): SlagElement[] {
		return [];
	}
}

export class SlagText extends SlagCharacterData {
	override readonly nodeType = NodeType.TEXT_NODE;
	override readonly nodeName = "#text";

	override cloneNode(_deep?: boolean): SlagText {
		return new SlagText(this.data);
	}
}

export class SlagComment extends SlagCharacterData {
	override readonly nodeType = NodeType.COMMENT_NODE;
	override readonly nodeName = "#comment";

	override cloneNode(_deep?: boolean): SlagComment {
		return new SlagComment(this.data);
	}
}

/**
 * A span of markup Slag never parsed.
 *
 * Slag has no HTML tokenizer by design, but `innerHTML =` and
 * `insertAdjacentHTML()` still have to do *something* rather than throw. They
 * park the string here: it serializes back out verbatim and is otherwise inert —
 * invisible to the selector engine, with no element structure to traverse.
 */
export class SlagRawMarkup extends SlagCharacterData {
	override readonly nodeType = NodeType.TEXT_NODE;
	override readonly nodeName = "#raw-markup";

	override cloneNode(_deep?: boolean): SlagRawMarkup {
		return new SlagRawMarkup(this.data);
	}
}
