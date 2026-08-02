/**
 * CSSOM shims.
 *
 * Slag does not parse or cascade CSS. These types exist so that code written
 * for a browser — `new CSSStyleSheet()`, `adoptedStyleSheets`, `el.style.color =
 * "red"` — runs unchanged on the server instead of throwing on a missing global.
 * Values are stored and serialized faithfully; nothing is ever computed.
 */

import { toCamelCase, toKebabCase } from "@bearmetal/miscellanea";

/** A constructable stylesheet. Holds its text; `cssRules` is always empty. */
export class SlagCSSStyleSheet {
	/** The stylesheet text, as last written by `replace`/`replaceSync`. */
	cssText = "";
	readonly cssRules: readonly never[] = [];

	replaceSync(text: string): void {
		this.cssText = text;
	}

	replace(text: string): Promise<SlagCSSStyleSheet> {
		this.replaceSync(text);
		return Promise.resolve(this);
	}

	toString(): string {
		return this.cssText;
	}
}

/** The subset of `CSSStyleDeclaration` Slag implements. */
export interface SlagStyleDeclaration {
	cssText: string;
	getPropertyValue(property: string): string;
	setProperty(property: string, value: string | null): void;
	removeProperty(property: string): string;
	readonly length: number;
	item(index: number): string;
	/** Camel-cased CSS properties (`backgroundColor`) read and write through. */
	[property: string]: unknown;
}

const declarationMethods = new Set([
	"cssText",
	"getPropertyValue",
	"setProperty",
	"removeProperty",
	"length",
	"item",
]);

function parseCssText(text: string): Map<string, string> {
	const declarations = new Map<string, string>();
	for (const part of text.split(";")) {
		const index = part.indexOf(":");
		if (index === -1) continue;
		const property = part.slice(0, index).trim();
		if (property) declarations.set(property, part.slice(index + 1).trim());
	}
	return declarations;
}

function formatCssText(declarations: Map<string, string>): string {
	return [...declarations].map(([property, value]) => `${property}: ${value}`).join("; ");
}

/**
 * Builds a live style declaration backed by an element's `style` attribute.
 *
 * Reads parse the attribute and writes rewrite it, so `setAttribute("style",
 * ...)` and `el.style.color = ...` can never drift apart.
 */
export function createStyleDeclaration(
	read: () => string,
	write: (cssText: string) => void,
): SlagStyleDeclaration {
	const target = {
		get cssText(): string {
			return read();
		},
		set cssText(text: string) {
			write(text);
		},
		getPropertyValue(property: string): string {
			return parseCssText(read()).get(property) ?? "";
		},
		setProperty(property: string, value: string | null): void {
			const declarations = parseCssText(read());
			if (value == null || value === "") declarations.delete(property);
			else declarations.set(property, value);
			write(formatCssText(declarations));
		},
		removeProperty(property: string): string {
			const declarations = parseCssText(read());
			const previous = declarations.get(property) ?? "";
			declarations.delete(property);
			write(formatCssText(declarations));
			return previous;
		},
		get length(): number {
			return parseCssText(read()).size;
		},
		item(index: number): string {
			return [...parseCssText(read()).keys()][index] ?? "";
		},
	};

	return new Proxy(target, {
		get(base, key, receiver) {
			if (typeof key !== "string" || declarationMethods.has(key)) {
				return Reflect.get(base, key, receiver);
			}
			return base.getPropertyValue(toKebabCase(key));
		},
		set(base, key, value, receiver) {
			if (typeof key !== "string" || declarationMethods.has(key)) {
				return Reflect.set(base, key, value, receiver);
			}
			base.setProperty(toKebabCase(key), value == null ? null : String(value));
			return true;
		},
		has(base, key) {
			if (typeof key === "string" && !declarationMethods.has(key)) {
				return parseCssText(read()).has(toKebabCase(key));
			}
			return Reflect.has(base, key);
		},
		ownKeys() {
			return [...parseCssText(read()).keys()].map((property) => toCamelCase(property));
		},
		getOwnPropertyDescriptor(base, key) {
			if (typeof key === "string" && !declarationMethods.has(key)) {
				return {
					configurable: true,
					enumerable: true,
					value: base.getPropertyValue(toKebabCase(key)),
				};
			}
			return Reflect.getOwnPropertyDescriptor(base, key);
		},
	}) as unknown as SlagStyleDeclaration;
}
