/**
 * The fonts Drip self-hosts and the helpers that turn a theme's chosen
 * families into an `@font-face` sheet.
 *
 * Drip themes only ever *name* fonts; nothing here is loaded unless a page asks
 * for it. {@linkcode ../ssr.tsx | Fonts} (and the `/@bearmetal/fonts` route on
 * {@linkcode ../module.ts | dripModule}) is the seam that emits the sheet — for
 * whichever self-hosted family a theme picks for its defaults, plus any named
 * explicitly.
 *
 * @module
 */

import type { Theme } from "../types.ts";
import { fontManifest } from "./manifest.ts";
import { fontFaces } from "./embedded.ts";

export { fontFaces } from "./embedded.ts";
export { type FontDef, type FontFace, type FontKey, fontManifest } from "./manifest.ts";

/** Lowercased family names of every font Drip self-hosts. */
export const selfHostedFonts = Object.keys(fontManifest) as (keyof typeof fontManifest)[];

/** Whether `family` (a bare name or a full stack) leads with a self-hosted font. */
export function isSelfHosted(family: string): boolean {
	return primaryFamily(family) in fontManifest;
}

/** The lowercased first family of a `font-family` stack, quotes stripped. */
function primaryFamily(stack: string): string {
	const first = stack.split(",")[0]?.trim() ?? "";
	return first.replace(/^["']|["']$/g, "").toLowerCase();
}

const FONT_ROLES = ["sans", "serif", "mono", "display", "body"] as const;

/**
 * The self-hosted fonts a theme actually uses — the lead family of each of its
 * `font.*` roles, kept only where Drip hosts it.
 */
export function themeFontKeys(theme: Theme): (keyof typeof fontManifest)[] {
	const font = theme.font;
	if (!font || typeof font !== "object") return [];
	const keys = new Set<keyof typeof fontManifest>();
	for (const role of FONT_ROLES) {
		const value = (font as Record<string, unknown>)[role];
		if (typeof value !== "string") continue;
		const name = primaryFamily(value);
		if (name in fontManifest) keys.add(name as keyof typeof fontManifest);
	}
	return [...keys];
}

/**
 * Concatenated `@font-face` sheets for the given families, deduped and in
 * manifest order. Names Drip does not host are skipped. `keys` accepts bare
 * family names or full `font-family` stacks.
 */
export function fontFaceCSS(keys: Iterable<string>): string {
	const want = new Set<string>();
	for (const key of keys) want.add(primaryFamily(key));
	return selfHostedFonts.filter((k) => want.has(k)).map((k) => fontFaces[k]).join("");
}

/** {@linkcode fontFaceCSS} for a theme's defaults plus any `extra` families. */
export function themeFontFaceCSS(theme: Theme, extra: Iterable<string> = []): string {
	return fontFaceCSS([...themeFontKeys(theme), ...extra]);
}
