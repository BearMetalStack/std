import { isDev } from "@bearmetal/miscellanea/environment";
import { escapeHtml, NO_ESCAPE, type NoEscape } from "./escape/mod.ts";
import { dedented } from "./indentation/mod.ts";

function ensureTrailingLine(s: string): string {
	return s.replace(/\n*$/, "\n");
}

/** Base tagged templates that dedents them via {@link dedented}. */
export const doc: typeof dedented = dedented.follow(ensureTrailingLine);
/** Tagged template that auto-escapes string interpolations via {@link escapeHtml} (prevent escape with {@link noEscape}). */
export const html: typeof doc = doc.lead((
	s,
	...v
) => [
	s,
	...v.map((v) => typeof v === "string" && !(v as NoEscape)[NO_ESCAPE] ? escapeHtml(v) : String(v)),
]);

/**
 * Provides syntax highlighting in editors
 * @see {@link doc}
 */
export const css: typeof doc = doc.follow((s) => isDev() ? s : s.replaceAll(/\n\s*/g, " "));
/**
 * Provides syntax highlighting in editors
 * @see {@link doc}
 */
export const ts: typeof doc = doc;
/**
 * Provides syntax highlighting in editors
 * @see {@link doc}
 */
export const tsx: typeof doc = doc;
/**
 * Provides syntax highlighting in editors
 * @see {@link doc}
 */
export const js: typeof doc = doc;
/**
 * Provides syntax highlighting in editors
 * @see {@link doc}
 */
export const jsx: typeof doc = doc;
