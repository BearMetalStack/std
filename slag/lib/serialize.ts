/**
 * Node → HTML string.
 *
 * This is the half of Slag that lets one JSX runtime serve both client and
 * server: a tree built with `document.createElement` can be handed straight to
 * a `Response` instead of going through a separate string-building runtime.
 *
 * Everything here is duck-typed off `nodeType`/`nodeName` rather than
 * `instanceof`, so `node.ts` can call into this module without an import cycle.
 */

import { escapeHtml } from "@bearmetal/miscellanea";
import { NodeType } from "./node_type.ts";
import type { SlagNode } from "./node.ts";
import type { SlagElement } from "./element.ts";

/** Elements that never get a closing tag. */
export const voidElements: ReadonlySet<string> = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

/** Elements whose text children are markup-opaque and must not be escaped. */
const rawTextElements: ReadonlySet<string> = new Set(["script", "style"]);

/** How a shadow root is rendered into the output. */
export type ShadowSerialization =
	/** Project light children through `<slot>` — what the user would actually see. */
	| "projected"
	/** Emit `<template shadowrootmode>`, so a browser rebuilds the shadow root. */
	| "declarative"
	/** Ignore shadow roots entirely and serialize light children. */
	| "none";

export interface SerializeOptions {
	/** Defaults to `"projected"`. */
	shadow?: ShadowSerialization;
}

function isElement(node: SlagNode): node is SlagElement {
	return node.nodeType === NodeType.ELEMENT_NODE;
}

function isRawMarkup(node: SlagNode): boolean {
	return node.nodeName === "#raw-markup";
}

function serializeAttributes(element: SlagElement): string {
	return element.getAttributeNames()
		.map((name) => {
			const value = element.getAttribute(name);
			// A valueless attribute round-trips as a bare name; browsers parse
			// `disabled` and `disabled=""` identically.
			if (value === "" || value == null) return ` ${name}`;
			return ` ${name}="${escapeHtml(value)}"`;
		})
		.join("");
}

/**
 * Light-DOM children of `host` grouped by the slot name they target, so a
 * `<slot name="x">` in the shadow tree can find its assigned nodes.
 */
function assignedNodes(host: SlagElement): Map<string, SlagNode[]> {
	const bySlot = new Map<string, SlagNode[]>();
	for (const child of host.childNodes) {
		const name = isElement(child) ? child.getAttribute("slot") ?? "" : "";
		const bucket = bySlot.get(name);
		if (bucket) bucket.push(child);
		else bySlot.set(name, [child]);
	}
	return bySlot;
}

function serializeChildren(
	node: SlagNode,
	options: Required<SerializeOptions>,
	slots: Map<string, SlagNode[]> | null,
): string {
	return node.childNodes.map((child) => serializeNode(child, options, slots)).join("");
}

function serializeNode(
	node: SlagNode,
	options: Required<SerializeOptions>,
	/** Slot assignments in scope, set only while walking inside a shadow tree. */
	slots: Map<string, SlagNode[]> | null,
): string {
	if (isRawMarkup(node)) return (node as unknown as { data: string }).data;

	switch (node.nodeType) {
		case NodeType.TEXT_NODE: {
			const { data } = node as unknown as { data: string };
			const parent = node.parentNode;
			if (parent && isElement(parent) && rawTextElements.has(parent.localName)) return data;
			return escapeHtml(data);
		}
		case NodeType.COMMENT_NODE:
			return `<!--${(node as unknown as { data: string }).data}-->`;
		case NodeType.ELEMENT_NODE:
			return serializeElement(node as SlagElement, options, slots);
		default:
			// Documents and fragments have no tag of their own.
			return serializeChildren(node, options, slots);
	}
}

function serializeElement(
	element: SlagElement,
	options: Required<SerializeOptions>,
	slots: Map<string, SlagNode[]> | null,
): string {
	// A `<slot>` inside a shadow tree is replaced by whatever the host assigned
	// to it, falling back to its own children when nothing was.
	if (slots && element.localName === "slot") {
		const assigned = slots.get(element.getAttribute("name") ?? "");
		if (assigned?.length) {
			return assigned.map((node) => serializeNode(node, options, null)).join("");
		}
		return serializeChildren(element, options, slots);
	}

	const tag = element.localName;
	const open = `<${tag}${serializeAttributes(element)}>`;
	if (voidElements.has(tag)) return open;

	const shadow = element.shadowRoot;
	if (shadow && options.shadow !== "none") {
		if (options.shadow === "declarative") {
			const template = `<template shadowrootmode="${shadow.mode}">` +
				`${serializeChildren(shadow, options, null)}</template>`;
			return `${open}${template}${serializeChildren(element, options, slots)}</${tag}>`;
		}
		return `${open}${serializeChildren(shadow, options, assignedNodes(element))}</${tag}>`;
	}

	// `<template>`'s children live in its `content` fragment, not on the element.
	const content = (element as unknown as { content?: SlagNode }).content;
	if (content) return `${open}${serializeChildren(content, options, slots)}</${tag}>`;

	return `${open}${serializeChildren(element, options, slots)}</${tag}>`;
}

/** Serializes a node and its subtree, including its own tag. */
export function serialize(node: SlagNode, options: SerializeOptions = {}): string {
	return serializeNode(node, { shadow: options.shadow ?? "projected" }, null);
}

/** Serializes a node's children only — the `innerHTML` getter. */
export function serializeInner(node: SlagNode, options: SerializeOptions = {}): string {
	return serializeChildren(node, { shadow: options.shadow ?? "projected" }, null);
}
