/**
 * String case conversion utilities. All transforms accept any common casing
 * (camelCase, PascalCase, snake_case, kebab-case, or space-separated words)
 * and produce the target format.
 * @module
 */

import { type Fn, fn } from "@fn";

type StringTrans = Fn<[string], string>;

/** Strips hyphens, underscores, and camelCase boundaries into spaces, then lowercases. Used as the base step for all other transforms. */
export const normalize: StringTrans = fn((str: string): string => {
	return str.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim()
		.toLowerCase();
});

/** Converts a string to `camelCase`. */
export const toCamelCase: StringTrans = normalize.follow((e) =>
	e.replace(/\s+(.)/g, (_, c) => c.toUpperCase())
);
/** Converts a string to `PascalCase`. */
export const toPascalCase: StringTrans = toCamelCase.follow((e) =>
	e.replace(/^./, (c) => c.toUpperCase())
);
/** Converts a string to `snake_case`. */
export const toSnakeCase: StringTrans = normalize.follow((e) => e.replace(/\s+/g, "_"));
/** Converts a string to `kebab-case`. */
export const toKebabCase: StringTrans = normalize.follow((e) => e.replace(/\s+/g, "-"));
/** Converts a string to `SCREAMING_SNAKE_CASE`. */
export const toScreamCase: StringTrans = toSnakeCase.follow((e) => e.toUpperCase());
/** Converts a string to `Sentence case` (first word capitalized, rest lowercase). */
export const toCapitalized: StringTrans = normalize.follow((e) =>
	e.replace(/^./, (c) => c.toUpperCase())
);
/** Converts a string to `Title Case` (every word capitalized). */
export const toTitleCase: StringTrans = toCapitalized.follow((e) =>
	e.replace(/\s+(.)/g, (_, c) => " " + c.toUpperCase())
);
