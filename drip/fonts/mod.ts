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
import { type FontDef, type FontFace, type FontKey, fontManifest } from "./manifest.ts";
import { fontData } from "./embedded.ts";

export { type FontDef, type FontFace, type FontKey, fontManifest } from "./manifest.ts";

/**
 * Where a linked `@font-face` rule points for a face: a base path the face's
 * manifest `file` is appended to (`"/fonts/"` → `/fonts/comfortaa/Comfortaa.woff2`),
 * or a function from that `file` to its URL.
 */
export type FontHref = string | ((file: string) => string);

/** Options for {@linkcode fontFaceCSS}. */
export interface FontFaceOptions {
	/**
	 * Point each face at a served `woff2` instead of inlining it as a `data:` URI.
	 * Serve the bytes from {@linkcode fontFile}.
	 */
	href?: FontHref;
}

/** Resolves a face's manifest `file` against a {@linkcode FontHref}. */
export function fontHref(href: FontHref, file: string): string {
	if (typeof href === "function") return href(file);
	return href.endsWith("/") ? href + file : `${href}/${file}`;
}

function faceRule(def: FontDef, face: FontFace, src: string): string {
	return `@font-face{` +
		`font-family:"${def.family}";` +
		`font-style:${face.style};` +
		`font-weight:${face.weight};` +
		`font-display:swap;` +
		`src:url("${src}") format("woff2")` +
		`}`;
}

function familySheet(key: FontKey, options: FontFaceOptions = {}): string {
	const def: FontDef = fontManifest[key];
	return def.faces.map((face) =>
		faceRule(
			def,
			face,
			options.href
				? fontHref(options.href, face.file)
				: `data:font/woff2;base64,${fontData[face.file]}`,
		)
	).join("");
}

/**
 * The inlined `@font-face` sheet for each self-hosted family, keyed as in the
 * manifest — every face as a base64 `data:` URI.
 */
export const fontFaces: Record<FontKey, string> = Object.fromEntries(
	(Object.keys(fontManifest) as FontKey[]).map((key) => [key, familySheet(key)]),
) as Record<FontKey, string>;

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

/** The self-hosted families among `keys`, deduped and in manifest order. */
function hostedKeys(keys: Iterable<string>): FontKey[] {
	const want = new Set<string>();
	for (const key of keys) want.add(primaryFamily(key));
	return selfHostedFonts.filter((k) => want.has(k));
}

/**
 * Concatenated `@font-face` sheets for the given families, deduped and in
 * manifest order. Names Drip does not host are skipped. `keys` accepts bare
 * family names or full `font-family` stacks.
 *
 * Faces are inlined as `data:` URIs unless `options.href` says where they are
 * served. Linked, a page downloads only the faces it actually renders with, and
 * the browser caches them across pages.
 */
export function fontFaceCSS(keys: Iterable<string>, options: FontFaceOptions = {}): string {
	const hosted = hostedKeys(keys);
	if (!options.href) return hosted.map((k) => fontFaces[k]).join("");
	return hosted.map((k) => familySheet(k, options)).join("");
}

/** {@linkcode fontFaceCSS} for a theme's defaults plus any `extra` families. */
export function themeFontFaceCSS(
	theme: Theme,
	extra: Iterable<string> = [],
	options: FontFaceOptions = {},
): string {
	return fontFaceCSS([...themeFontKeys(theme), ...extra], options);
}

/**
 * The manifest `file` of every face of the given families, deduped and in
 * manifest order — what a linked sheet references, for preloading or for
 * writing the fonts out in a static build.
 */
export function fontFiles(keys: Iterable<string>): string[] {
	return hostedKeys(keys).flatMap((k) => fontManifest[k].faces.map((face) => face.file));
}

/**
 * The `woff2` bytes of one self-hosted face, by its manifest `file`
 * (`"comfortaa/Comfortaa.woff2"`), or `undefined` for a file Drip doesn't ship.
 * Serve these at the paths a linked {@linkcode fontFaceCSS} points to.
 */
export function fontFile(file: string): Uint8Array<ArrayBuffer> | undefined {
	const b64 = Object.hasOwn(fontData, file) ? fontData[file] : undefined;
	if (b64 === undefined) return undefined;
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
