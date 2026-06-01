/**
 * String utilities: HTML escaping, indentation, box drawing, and tagged template literals.
 * @module
 */

import { escapeHtml } from "./htmlEscape.ts";
export * from "./box.ts";
export * from "./htmlEscape.ts";
export * from "./indentation.ts";

/** Tagged template that concatenates values as-is — provides syntax highlighting in editors. */
export function css(
	strings: TemplateStringsArray,
	...values: (string | number | boolean)[]
): string {
	let result = "";
	for (let i = 0; i < strings.length; i++) {
		result += strings[i];
		if (i < values.length) {
			result += values[i];
		}
	}
	return result;
}

/** Tagged template that auto-escapes string interpolations via {@link escapeHtml}. */
export function html(
	strings: TemplateStringsArray,
	...values: (string | number | boolean)[]
): string {
	let result = "";
	for (let i = 0; i < strings.length; i++) {
		result += strings[i];
		if (i < values.length) {
			result += typeof values[i] === "string" ? escapeHtml(values[i] as string) : String(values[i]);
		}
	}
	return result;
}

export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, (e) => `\\${e}`);
}
