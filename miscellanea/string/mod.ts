/**
 * String utilities: HTML escaping, indentation, box drawing, and tagged template literals.
 * @module
 */

export * from "./ascii/mod.ts";
export * from "./box.ts";
export * from "./escape/mod.ts";
export * from "./indentation/mod.ts";
export * from "./templateTags.ts";

export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, (e) => `\\${e}`);
}
