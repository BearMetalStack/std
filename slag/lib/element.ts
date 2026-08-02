import { toCamelCase, toKebabCase } from "@bearmetal/miscellanea";
import { NodeType } from "./node_type.ts";
import { SlagNode, SlagRawMarkup } from "./node.ts";
import { SlagDocumentFragment } from "./fragment.ts";
import { SlagShadowRoot } from "./shadow.ts";
import { serialize, serializeInner } from "./serialize.ts";
import { matchesSelector } from "./selector.ts";
import { createStyleDeclaration, type SlagStyleDeclaration } from "./css.ts";
import { dispatchAttributeChanged, resolveConstructingTag } from "./custom_elements.ts";
import type { ShadowRootMode } from "./shadow.ts";

export const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Read-only view of an element's attributes, standing in for `NamedNodeMap`. */
export interface SlagAttr {
	readonly name: string;
	readonly value: string;
}

/** `DOMTokenList` over a single space-separated attribute. */
export class SlagTokenList {
	#read: () => string;
	#write: (value: string) => void;

	constructor(read: () => string, write: (value: string) => void) {
		this.#read = read;
		this.#write = write;
	}

	#tokens(): string[] {
		return this.#read().split(/\s+/).filter(Boolean);
	}

	get value(): string {
		return this.#read();
	}

	set value(next: string) {
		this.#write(next);
	}

	get length(): number {
		return this.#tokens().length;
	}

	contains(token: string): boolean {
		return this.#tokens().includes(token);
	}

	add(...tokens: string[]): void {
		const current = this.#tokens();
		for (const token of tokens) if (token && !current.includes(token)) current.push(token);
		this.#write(current.join(" "));
	}

	remove(...tokens: string[]): void {
		this.#write(this.#tokens().filter((token) => !tokens.includes(token)).join(" "));
	}

	toggle(token: string, force?: boolean): boolean {
		const present = this.contains(token);
		const next = force ?? !present;
		if (next) this.add(token);
		else this.remove(token);
		return next;
	}

	item(index: number): string | null {
		return this.#tokens()[index] ?? null;
	}

	values(): IterableIterator<string> {
		return this.#tokens().values();
	}

	[Symbol.iterator](): IterableIterator<string> {
		return this.values();
	}

	toString(): string {
		return this.#read();
	}
}

export class SlagElement extends SlagNode {
	override readonly nodeType = NodeType.ELEMENT_NODE;

	readonly localName: string;
	readonly namespaceURI: string;

	/**
	 * Form-control value/checked state.
	 *
	 * Not spec-accurate placement — these belong on `HTMLInputElement` — but the
	 * JSX runtime's `$bind` writes `el.value`/`el.checked` on whatever element it
	 * was given, and a shim that throws there is worse than one that is too
	 * permissive.
	 */
	value = "";
	checked = false;

	#attributes = new Map<string, string>();
	#shadowRoot: SlagShadowRoot | null = null;
	#classList?: SlagTokenList;
	#style?: SlagStyleDeclaration;
	#dataset?: Record<string, string | undefined>;

	/**
	 * @param localName Omit when constructing a registered custom element —
	 * `new MyElement()` takes no arguments, so the tag is recovered from the
	 * in-flight `createElement` call or from the class's registry entry.
	 */
	constructor(localName?: string, namespaceURI: string = HTML_NAMESPACE) {
		super();
		const tag = localName ?? resolveConstructingTag(new.target);
		if (!tag) {
			throw new Error(
				`Cannot construct ${new.target?.name ?? "an element"} directly: ` +
					"it is not registered with customElements, so Slag cannot determine its tag name.",
			);
		}
		this.namespaceURI = namespaceURI;
		// HTML tag names are case-insensitive and canonically lowercase; SVG's
		// are not (`linearGradient`, `textPath`), so those pass through as given.
		this.localName = namespaceURI === HTML_NAMESPACE ? tag.toLowerCase() : tag;
	}

	override get nodeName(): string {
		return this.tagName;
	}

	get tagName(): string {
		return this.namespaceURI === HTML_NAMESPACE ? this.localName.toUpperCase() : this.localName;
	}

	// -- attributes --

	#normalize(name: string): string {
		return this.namespaceURI === HTML_NAMESPACE ? name.toLowerCase() : name;
	}

	getAttribute(name: string): string | null {
		return this.#attributes.get(this.#normalize(name)) ?? null;
	}

	setAttribute(name: string, value: string): void {
		const key = this.#normalize(name);
		const previous = this.#attributes.get(key) ?? null;
		const next = String(value);
		this.#attributes.set(key, next);
		if (previous !== next) dispatchAttributeChanged(this, key, previous, next);
	}

	removeAttribute(name: string): void {
		const key = this.#normalize(name);
		if (!this.#attributes.has(key)) return;
		const previous = this.#attributes.get(key) ?? null;
		this.#attributes.delete(key);
		dispatchAttributeChanged(this, key, previous, null);
	}

	hasAttribute(name: string): boolean {
		return this.#attributes.has(this.#normalize(name));
	}

	hasAttributes(): boolean {
		return this.#attributes.size > 0;
	}

	toggleAttribute(name: string, force?: boolean): boolean {
		const next = force ?? !this.hasAttribute(name);
		if (next) this.setAttribute(name, "");
		else this.removeAttribute(name);
		return next;
	}

	getAttributeNames(): string[] {
		return [...this.#attributes.keys()];
	}

	get attributes(): SlagAttr[] {
		return [...this.#attributes].map(([name, value]) => ({ name, value }));
	}

	// -- reflected properties --

	get id(): string {
		return this.getAttribute("id") ?? "";
	}

	set id(value: string) {
		this.setAttribute("id", value);
	}

	get className(): string {
		return this.getAttribute("class") ?? "";
	}

	set className(value: string) {
		this.setAttribute("class", value);
	}

	get classList(): SlagTokenList {
		return this.#classList ??= new SlagTokenList(
			() => this.getAttribute("class") ?? "",
			(value) => value ? this.setAttribute("class", value) : this.removeAttribute("class"),
		);
	}

	get style(): SlagStyleDeclaration {
		return this.#style ??= createStyleDeclaration(
			() => this.getAttribute("style") ?? "",
			(cssText) => cssText ? this.setAttribute("style", cssText) : this.removeAttribute("style"),
		);
	}

	/** `data-*` attributes, camel-cased. Live: reads and writes hit the attributes. */
	get dataset(): Record<string, string | undefined> {
		return this.#dataset ??= new Proxy({} as Record<string, string | undefined>, {
			get: (_, key) =>
				typeof key === "string"
					? this.getAttribute(`data-${toKebabCase(key)}`) ?? undefined
					: undefined,
			set: (_, key, value) => {
				if (typeof key !== "string") return false;
				this.setAttribute(`data-${toKebabCase(key)}`, String(value));
				return true;
			},
			deleteProperty: (_, key) => {
				if (typeof key !== "string") return false;
				this.removeAttribute(`data-${toKebabCase(key)}`);
				return true;
			},
			has: (_, key) => typeof key === "string" && this.hasAttribute(`data-${toKebabCase(key)}`),
			ownKeys: () =>
				this.getAttributeNames()
					.filter((name) => name.startsWith("data-"))
					.map((name) => toCamelCase(name.slice(5))),
			getOwnPropertyDescriptor: (_, key) => {
				if (typeof key !== "string") return undefined;
				const name = `data-${toKebabCase(key)}`;
				if (!this.hasAttribute(name)) return undefined;
				return { configurable: true, enumerable: true, value: this.getAttribute(name) };
			},
		});
	}

	// -- shadow dom --

	attachShadow(init: { mode?: ShadowRootMode } = {}): SlagShadowRoot {
		if (this.#shadowRoot) {
			throw new Error("Failed to execute 'attachShadow': shadow root cannot be created twice.");
		}
		this.#shadowRoot = new SlagShadowRoot(this, init.mode ?? "open");
		return this.#shadowRoot;
	}

	/** `null` for a closed root, matching the browser. */
	get shadowRoot(): SlagShadowRoot | null {
		return this.#shadowRoot?.mode === "open" ? this.#shadowRoot : null;
	}

	// -- markup --

	get outerHTML(): string {
		return serialize(this);
	}

	get innerHTML(): string {
		return serializeInner(this);
	}

	/**
	 * Slag has no HTML parser. An empty string clears the element; anything else
	 * is stored verbatim as raw markup — it serializes back out unchanged but is
	 * inert, so `querySelector` will not see inside it.
	 */
	set innerHTML(markup: string) {
		this.replaceChildren();
		if (markup !== "") this.appendChild(new SlagRawMarkup(markup));
	}

	/** Same no-parser caveat as {@linkcode SlagElement.innerHTML}. */
	insertAdjacentHTML(
		position: "beforebegin" | "afterbegin" | "beforeend" | "afterend",
		markup: string,
	): void {
		if (markup === "") return;
		const node = new SlagRawMarkup(markup);
		switch (position) {
			case "beforebegin":
				this.before(node);
				return;
			case "afterbegin":
				this.insertBefore(node, this.firstChild);
				return;
			case "beforeend":
				this.appendChild(node);
				return;
			case "afterend":
				this.after(node);
				return;
		}
	}

	// -- traversal helpers --

	matches(selector: string): boolean {
		return matchesSelector(this, selector, this);
	}

	closest(selector: string): SlagElement | null {
		if (matchesSelector(this, selector, this)) return this;
		for (let node = this.parentElement; node; node = node.parentElement) {
			if (matchesSelector(node, selector, node)) return node;
		}
		return null;
	}

	// -- browser-only APIs, shimmed so server-side calls are no-ops --

	focus(): void {}
	blur(): void {}
	scrollIntoView(): void {}

	click(): void {
		this.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
	}

	getBoundingClientRect(): {
		x: number;
		y: number;
		top: number;
		left: number;
		right: number;
		bottom: number;
		width: number;
		height: number;
	} {
		return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
	}

	override cloneNode(deep = false): SlagElement {
		const clone = new (this.constructor as new (
			localName?: string,
			namespaceURI?: string,
		) => SlagElement)(this.localName, this.namespaceURI);
		clone.ownerDocument = this.ownerDocument;
		for (const [name, value] of this.#attributes) clone.#attributes.set(name, value);
		if (deep) this.cloneChildrenInto(clone);
		return clone;
	}
}

/** The `HTMLElement` global. Custom elements — including `BMC` — extend this. */
export class SlagHTMLElement extends SlagElement {}

/** The `SVGElement` global. Produced by `createElementNS` in the SVG namespace. */
export class SlagSVGElement extends SlagElement {
	constructor(localName?: string) {
		super(localName, SVG_NAMESPACE);
	}
}

/** `<template>`: children live in `content`, not on the element itself. */
export class SlagTemplateElement extends SlagHTMLElement {
	readonly content: SlagDocumentFragment = new SlagDocumentFragment();

	constructor(localName = "template") {
		super(localName);
	}

	override cloneNode(deep = false): SlagTemplateElement {
		const clone = super.cloneNode(false) as SlagTemplateElement;
		if (deep) {
			for (const child of this.content.childNodes) {
				clone.content.appendChild(child.cloneNode(true));
			}
		}
		return clone;
	}
}
