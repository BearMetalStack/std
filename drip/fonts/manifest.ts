/**
 * The fonts Drip self-hosts, keyed by the lowercased family name that a theme's
 * `font.*` token names. {@linkcode ../ssr.tsx | Fonts} looks a theme's chosen
 * families up here and emits an `@font-face` sheet for every match.
 *
 * Assets under `assets/<key>/` are subset from the upstream Nerd Font builds —
 * Latin, punctuation, currency, arrows, maths, box-drawing and block/geometric
 * shapes, with the private-use icon glyphs (and Greek/Cyrillic) dropped. See
 * `tools/subset.sh` to regenerate them, then `deno task bm:fonts` to re-embed.
 *
 * @module
 */

/** One `@font-face` src within a {@linkcode FontDef}. */
export interface FontFace {
	/** Path to the `woff2`, relative to `assets/`. */
	file: string;
	/** `font-weight` descriptor — a single value or a `"min max"` range for a variable face. */
	weight: string;
	/** `font-style` descriptor. */
	style: "normal" | "italic" | "oblique";
}

/** A self-hosted family: the CSS `font-family` it registers and its faces. */
export interface FontDef {
	/** The `font-family` name the `@font-face` rules register. */
	family: string;
	faces: FontFace[];
}

/** Every family Drip self-hosts, keyed by its lowercased family name. */
export const fontManifest = {
	comfortaa: {
		family: "Comfortaa",
		faces: [
			{ file: "comfortaa/Comfortaa.woff2", weight: "300 700", style: "normal" },
		],
	},
	monofur: {
		family: "Monofur",
		faces: [
			{ file: "monofur/Monofur-Regular.woff2", weight: "400", style: "normal" },
			{ file: "monofur/Monofur-Bold.woff2", weight: "700", style: "normal" },
			{ file: "monofur/Monofur-Italic.woff2", weight: "400", style: "italic" },
		],
	},
} as const satisfies Record<string, FontDef>;

/** Lowercased family name of a self-hosted font — a key of {@linkcode fontManifest}. */
export type FontKey = keyof typeof fontManifest;
