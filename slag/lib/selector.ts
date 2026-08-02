/**
 * A deliberately small CSS selector engine.
 *
 * Slag supports the selector shapes that actually appear in this stack —
 * `querySelectorAll("[ref]")` in `BMElement.connectedCallback`,
 * `head.querySelector("style#some-tag")` in `@define` — plus the obvious
 * neighbours: tag, `*`, `#id`, `.class`, attribute matchers, `:scope`, and the
 * four combinators.
 *
 * Anything outside that set (`:hover`, `:nth-child()`, namespaces) **throws with
 * the offending selector in the message** rather than quietly matching nothing.
 * The mini-DOMs this replaces returned `[]` from `querySelectorAll` no matter
 * what, which is exactly how the `ref=` registration path went untested for so
 * long; a loud failure is the point.
 */

import type { SlagElement } from "./element.ts";
import type { SlagNode } from "./node.ts";
import { NodeType } from "./node_type.ts";

type AttributeOperator = "exists" | "=" | "~=" | "|=" | "^=" | "$=" | "*=";

interface AttributeMatcher {
	name: string;
	operator: AttributeOperator;
	value: string;
}

interface CompoundSelector {
	tag?: string;
	id?: string;
	classes: string[];
	attributes: AttributeMatcher[];
	scope: boolean;
}

type Combinator = "descendant" | "child" | "adjacent" | "sibling";

/** One compound selector plus how it relates to the compound on its left. */
interface SelectorStep {
	combinator: Combinator | null;
	compound: CompoundSelector;
}

/** A parsed selector: a list of alternatives, each a left-to-right step chain. */
export type ParsedSelector = SelectorStep[][];

function unsupported(selector: string, detail: string): never {
	throw new Error(`Slag's selector engine does not support ${detail} (in "${selector}")`);
}

function isIdentStart(char: string | undefined): boolean {
	return char !== undefined && /[A-Za-z_\u00a0-\uffff\\-]/.test(char);
}

function isIdentChar(char: string | undefined): boolean {
	return char !== undefined && /[\w\u00a0-\uffff\\-]/.test(char);
}

function readIdent(input: string, start: number, selector: string): [string, number] {
	let index = start;
	let out = "";
	while (index < input.length && isIdentChar(input[index])) {
		if (input[index] === "\\") index++;
		out += input[index++];
	}
	if (!out) unsupported(selector, `an empty identifier at offset ${start}`);
	return [out, index];
}

function readString(input: string, start: number, selector: string): [string, number] {
	const quote = input[start];
	let index = start + 1;
	let out = "";
	while (index < input.length && input[index] !== quote) {
		if (input[index] === "\\") index++;
		out += input[index++];
	}
	if (input[index] !== quote) unsupported(selector, "an unterminated string");
	return [out, index + 1];
}

function parseAttribute(
	input: string,
	start: number,
	selector: string,
): [AttributeMatcher, number] {
	let index = start + 1; // past "["
	while (/\s/.test(input[index] ?? "")) index++;
	const [name, afterName] = readIdent(input, index, selector);
	index = afterName;
	while (/\s/.test(input[index] ?? "")) index++;

	if (input[index] === "]") return [{ name, operator: "exists", value: "" }, index + 1];

	const twoChar = input.slice(index, index + 2);
	let operator: AttributeOperator;
	if (["~=", "|=", "^=", "$=", "*="].includes(twoChar)) {
		operator = twoChar as AttributeOperator;
		index += 2;
	} else if (input[index] === "=") {
		operator = "=";
		index += 1;
	} else {
		unsupported(selector, `the attribute operator at offset ${index}`);
	}

	while (/\s/.test(input[index] ?? "")) index++;
	let value: string;
	if (input[index] === '"' || input[index] === "'") {
		[value, index] = readString(input, index, selector);
	} else {
		[value, index] = readIdent(input, index, selector);
	}
	while (/\s/.test(input[index] ?? "")) index++;
	if (input[index] !== "]") unsupported(selector, `the attribute selector at offset ${start}`);
	return [{ name, operator, value }, index + 1];
}

function parseCompound(input: string, start: number, selector: string): [CompoundSelector, number] {
	const compound: CompoundSelector = { classes: [], attributes: [], scope: false };
	let index = start;

	if (input[index] === "*") {
		index++;
	} else if (isIdentStart(input[index])) {
		const [tag, after] = readIdent(input, index, selector);
		compound.tag = tag.toLowerCase();
		index = after;
	}

	for (;;) {
		const char = input[index];
		if (char === "#") {
			const [id, after] = readIdent(input, index + 1, selector);
			compound.id = id;
			index = after;
		} else if (char === ".") {
			const [name, after] = readIdent(input, index + 1, selector);
			compound.classes.push(name);
			index = after;
		} else if (char === "[") {
			const [matcher, after] = parseAttribute(input, index, selector);
			compound.attributes.push(matcher);
			index = after;
		} else if (char === ":") {
			const [name, after] = readIdent(input, index + 1, selector);
			if (name.toLowerCase() !== "scope") unsupported(selector, `the pseudo-class ":${name}"`);
			compound.scope = true;
			index = after;
		} else {
			break;
		}
	}

	if (index === start) unsupported(selector, `the token at offset ${start}`);
	return [compound, index];
}

function parseComplex(input: string, selector: string): SelectorStep[] {
	const steps: SelectorStep[] = [];
	let index = 0;
	let combinator: Combinator | null = null;

	while (index < input.length) {
		let sawWhitespace = false;
		while (index < input.length && /\s/.test(input[index])) {
			index++;
			sawWhitespace = true;
		}
		if (index >= input.length) break;

		const char = input[index];
		if (char === ">" || char === "+" || char === "~") {
			combinator = char === ">" ? "child" : char === "+" ? "adjacent" : "sibling";
			index++;
			continue;
		}
		if (sawWhitespace && steps.length > 0 && combinator === null) combinator = "descendant";

		const [compound, after] = parseCompound(input, index, selector);
		steps.push({ combinator, compound });
		combinator = null;
		index = after;
	}

	if (steps.length === 0) unsupported(selector, "an empty selector");
	if (combinator !== null) unsupported(selector, "a trailing combinator");
	return steps;
}

const cache = new Map<string, ParsedSelector>();

/** Parses a selector list, memoized — the same selectors recur constantly. */
export function parseSelector(selector: string): ParsedSelector {
	const cached = cache.get(selector);
	if (cached) return cached;
	// No functional pseudo-classes are supported, so commas are always top-level.
	const parsed = selector.split(",").map((alternative) => {
		const trimmed = alternative.trim();
		if (!trimmed) unsupported(selector, "an empty selector in the list");
		return parseComplex(trimmed, selector);
	});
	cache.set(selector, parsed);
	return parsed;
}

function matchesAttribute(element: SlagElement, matcher: AttributeMatcher): boolean {
	const actual = element.getAttribute(matcher.name);
	if (actual === null) return false;
	switch (matcher.operator) {
		case "exists":
			return true;
		case "=":
			return actual === matcher.value;
		case "~=":
			return actual.split(/\s+/).includes(matcher.value);
		case "|=":
			return actual === matcher.value || actual.startsWith(`${matcher.value}-`);
		case "^=":
			return matcher.value !== "" && actual.startsWith(matcher.value);
		case "$=":
			return matcher.value !== "" && actual.endsWith(matcher.value);
		case "*=":
			return matcher.value !== "" && actual.includes(matcher.value);
	}
}

function matchesCompound(
	element: SlagElement,
	compound: CompoundSelector,
	scope: SlagNode | null,
): boolean {
	if (compound.scope && (element as SlagNode) !== scope) return false;
	if (compound.tag && element.localName.toLowerCase() !== compound.tag) return false;
	if (compound.id !== undefined && element.getAttribute("id") !== compound.id) return false;
	for (const className of compound.classes) {
		if (!element.classList.contains(className)) return false;
	}
	for (const matcher of compound.attributes) {
		if (!matchesAttribute(element, matcher)) return false;
	}
	return true;
}

/** Matches right-to-left: `steps[index]` must match `element`, then its left neighbour. */
function matchesFrom(
	element: SlagElement,
	steps: SelectorStep[],
	index: number,
	scope: SlagNode | null,
): boolean {
	if (!matchesCompound(element, steps[index].compound, scope)) return false;
	if (index === 0) return true;

	switch (steps[index].combinator) {
		case "child": {
			const parent = element.parentElement;
			return parent ? matchesFrom(parent, steps, index - 1, scope) : false;
		}
		case "descendant": {
			for (let node = element.parentElement; node; node = node.parentElement) {
				if (matchesFrom(node, steps, index - 1, scope)) return true;
			}
			return false;
		}
		case "adjacent": {
			const previous = element.previousElementSibling;
			return previous ? matchesFrom(previous, steps, index - 1, scope) : false;
		}
		case "sibling": {
			for (
				let node = element.previousElementSibling;
				node;
				node = node.previousElementSibling
			) {
				if (matchesFrom(node, steps, index - 1, scope)) return true;
			}
			return false;
		}
		default:
			return false;
	}
}

/** `Element.matches`, with an optional `:scope` reference node. */
export function matchesSelector(
	element: SlagElement,
	selector: string,
	scope: SlagNode | null = null,
): boolean {
	return parseSelector(selector).some((steps) =>
		matchesFrom(element, steps, steps.length - 1, scope)
	);
}

function* descendantElements(node: SlagNode): Generator<SlagElement> {
	for (const child of node.childNodes) {
		if (child.nodeType === NodeType.ELEMENT_NODE) yield child as SlagElement;
		yield* descendantElements(child);
	}
}

/** `ParentNode.querySelectorAll`, in tree order. */
export function querySelectorAll(root: SlagNode, selector: string): SlagElement[] {
	const parsed = parseSelector(selector);
	const found: SlagElement[] = [];
	for (const element of descendantElements(root)) {
		if (parsed.some((steps) => matchesFrom(element, steps, steps.length - 1, root))) {
			found.push(element);
		}
	}
	return found;
}

/** `ParentNode.querySelector`. */
export function querySelector(root: SlagNode, selector: string): SlagElement | null {
	const parsed = parseSelector(selector);
	for (const element of descendantElements(root)) {
		if (parsed.some((steps) => matchesFrom(element, steps, steps.length - 1, root))) {
			return element;
		}
	}
	return null;
}
