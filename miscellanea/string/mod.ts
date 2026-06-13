/**
 * String utilities: HTML escaping, indentation, box drawing, and tagged template literals.
 * @module
 */

import { escapeHtml } from "./htmlEscape.ts";
import { dedented } from "./indentation.ts";
export * from "./box.ts";
export * from "./htmlEscape.ts";
export * from "./indentation.ts";
export * from "./ascii/mod.ts";

/** Tagged templates that concatenate values and dedents them via {@link dedented} - provides syntax highlighting in editors. */
export const css = dedented;
export const tsx = dedented;
export const ts = dedented;

/** Tagged template that auto-escapes string interpolations via {@link escapeHtml}. */
export function html(
	strings: TemplateStringsArray,
	...values: (string | number | boolean)[]
): string {
	return dedented(
		strings,
		...values.map((v) => typeof v === "string" ? escapeHtml(v as string) : String(v)),
	);
}

export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, (e) => `\\${e}`);
}
