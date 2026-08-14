/**
 * @module
 * The document style registry: a caller's own named styles, and the length
 * arithmetic every target format needs to spell them.
 *
 * This is the write-side counterpart to `style.ts`. Where `ResolvedStyle` is a
 * small normalized bag that *rules match on*, a `StyleBlock` is rich formatting
 * that nothing matches on - it is looked up by name at emit time and spelled in
 * whichever vocabulary the target uses. Keeping them apart is what lets
 * `ResolvedStyle` stay small enough for `whereStyle(s => s.bold)` to be
 * ergonomic while a novel still gets its own typography.
 *
 * ```ts
 * const styles = createDocumentStyles()
 * 	.define("SceneBreak", { align: "c", spaceBefore: "1.5em", fontStyle: "italic" })
 * 	.bind("graver:scenebreak", "SceneBreak");
 *
 * markdownWith(src, docxWriter({ styles }));
 * markdownWith(src, odtWriter({ styles }));
 * markdownWith(src, htmlWriter({ styles }));
 * ```
 */

import { toKebabCase, toPascalCase } from "@bearmetal/miscellanea/string";
import type {
	CssLength,
	DocumentStyles,
	DocumentStylesOptions,
	Node,
	ResolvedStyle,
	StyleBlock,
	StyleDef,
	StyleTable,
	TokenIdentifier,
} from "./types.ts";
import { createStyleTable } from "./style.ts";
import { parseStyleSheet } from "./css.ts";

// ---- lengths --------------------------------------------------------------

/** A parsed CSS length: a magnitude and the unit it was written in. */
export interface Length {
	value: number;
	unit: string;
}

/** Points per unit, for the units with a fixed physical size. */
const ABSOLUTE: Record<string, number> = {
	pt: 1,
	pc: 12,
	in: 72,
	cm: 72 / 2.54,
	mm: 72 / 25.4,
	// The CSS reference pixel, which is 1/96in regardless of the display.
	px: 72 / 96,
};

/** Units ODF's `fo:` properties accept verbatim, so they survive unconverted. */
const ODF_UNITS = new Set(["pt", "pc", "in", "cm", "mm"]);

const LENGTH_RX = /^\s*(-?\d*\.?\d+)\s*([a-z%]*)\s*$/i;

/**
 * Parses a CSS length. A bare number is treated as `px`, matching how a browser
 * would *not* - but a bare number in a stylesheet is almost always a mistake,
 * and px is the least surprising reading of it.
 */
export function parseLength(input: CssLength | number | undefined): Length | undefined {
	if (input === undefined) return undefined;
	if (typeof input === "number") return { value: input, unit: "px" };
	const match = LENGTH_RX.exec(input);
	if (!match) return undefined;
	return { value: Number(match[1]), unit: (match[2] || "px").toLowerCase() };
}

/**
 * Converts a length to points, resolving relative units against `basePt`.
 *
 * `em`, `rem`, and `%` have to be resolved here because neither docx twips nor
 * ODF `fo:` lengths have any relative form. HTML output never calls this - it
 * keeps the length as written, which is the whole reason CSS is a supported
 * input in the first place.
 */
export function toPoints(len: Length | undefined, basePt: number): number | undefined {
	if (!len) return undefined;
	const absolute = ABSOLUTE[len.unit];
	if (absolute !== undefined) return len.value * absolute;
	if (len.unit === "em" || len.unit === "rem") return len.value * basePt;
	if (len.unit === "%") return (len.value / 100) * basePt;
	return undefined;
}

/** Twips - twentieths of a point. `<w:ind>`, `<w:spacing>`. */
export function toTwips(len: Length | undefined, basePt: number): number | undefined {
	const points = toPoints(len, basePt);
	return points === undefined ? undefined : Math.round(points * 20);
}

/** Half-points. `<w:sz>`, `<w:szCs>`. */
export function toHalfPoints(len: Length | undefined, basePt: number): number | undefined {
	const points = toPoints(len, basePt);
	return points === undefined ? undefined : Math.round(points * 2);
}

/** Eighths of a point. `<w:pBdr>` border widths. */
export function toEighthPoints(len: Length | undefined, basePt: number): number | undefined {
	const points = toPoints(len, basePt);
	return points === undefined ? undefined : Math.round(points * 8);
}

/**
 * An ODF `fo:` length. Units ODF already accepts pass through as written, so a
 * stylesheet in centimetres stays in centimetres; everything else (px and the
 * relative units) resolves to points.
 */
export function toOdfLength(len: Length | undefined, basePt: number): string | undefined {
	if (!len) return undefined;
	if (ODF_UNITS.has(len.unit)) return `${round(len.value)}${len.unit}`;
	const points = toPoints(len, basePt);
	return points === undefined ? undefined : `${round(points)}pt`;
}

/** Trims float noise so `1cm` does not come back as `28.346456692913385pt`. */
function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Whether a CSS `font-weight` counts as bold.
 *
 * Shared with the HTML *read* profile so the two directions agree on where the
 * boundary sits - a document written with `font-weight: 600` must read back as
 * bold, not as plain text.
 */
export function isBoldWeight(value: string | number | undefined): boolean {
	if (value === undefined) return false;
	if (typeof value === "number") return value >= 600;
	const normalized = value.trim().toLowerCase();
	if (normalized === "bold" || normalized === "bolder") return true;
	const numeric = Number(normalized);
	return Number.isFinite(numeric) && numeric >= 600;
}

// ---- the registry ---------------------------------------------------------

const MAX_BASED_ON_DEPTH = 32;

/** Properties `basedOn` must never inherit - they identify the style itself. */
const NOT_INHERITED: readonly (keyof StyleBlock)[] = [
	"displayName",
	"basedOn",
	"className",
];

/**
 * Flattens a `StyleBlock` to the normalized `ResolvedStyle` the rest of the
 * engine matches on.
 *
 * Lossy on purpose, and in one direction only: a font size or a letter spacing
 * has no `ResolvedStyle` slot and does not need one, because nothing matches on
 * it. What has to survive is the handful of properties a *rule* might branch
 * on, plus the role that tells a reader this paragraph is a heading.
 */
export function toResolvedStyle(name: string, block: StyleBlock): ResolvedStyle {
	const out: ResolvedStyle = {};
	if (block.family === "text") out.charStyle = name;
	else out.named = name;
	if (block.role !== undefined) out.blockRole = block.role;
	if (block.headingLevel !== undefined) out.headingLevel = block.headingLevel;
	if (block.fontWeight !== undefined) out.bold = isBoldWeight(block.fontWeight);
	if (block.fontStyle !== undefined) out.italic = block.fontStyle === "italic";
	if (block.underline !== undefined) out.underline = block.underline;
	if (block.strike !== undefined) out.strike = block.strike;
	if (block.background !== undefined) out.highlight = true;
	if (block.align !== undefined) out.align = block.align;
	if (block.breakBefore !== undefined) out.breakBefore = block.breakBefore;
	if (block.breakAfter !== undefined) out.breakAfter = block.breakAfter;
	return out;
}

/**
 * Builds a registry of named styles.
 *
 * Name mangling goes through `@bearmetal/miscellanea/string` rather than a
 * local copy: `toPascalCase`/`toKebabCase` already normalize from any input
 * casing, which is exactly the round trip `fromCss` needs when it turns a
 * `.scene-break` selector back into a style name.
 */
export function createDocumentStyles(options: DocumentStylesOptions = {}): DocumentStyles {
	const baseFontSize = options.baseFontSize ?? "12pt";
	const blocks = new Map<string, StyleBlock>();
	const bindings = new Map<TokenIdentifier, string>();
	const resolved = new Map<string, StyleBlock>();
	const ids = new Map<string, string>();

	const warn = (message: string) => options.onWarn?.(message);

	const self: DocumentStyles = {
		define(name, block) {
			const id = toPascalCase(name);
			const owner = ids.get(id);
			if (owner !== undefined && owner !== name) {
				// docx style ids and ODF style names cannot hold a space, so two
				// display names that differ only in punctuation collapse onto one
				// id and the second silently wins. Naming both is the only way the
				// caller can tell what happened.
				warn(
					`style "${name}" and style "${owner}" both map to the id "${id}"; ` +
						`"${name}" will overwrite it`,
				);
			}
			ids.set(id, name);
			blocks.set(name, block);
			resolved.clear();
			return self;
		},

		defineAll(entries) {
			for (const [name, block] of Object.entries(entries)) self.define(name, block);
			return self;
		},

		fromCss(source) {
			for (const [name, block] of parseStyleSheet(source, { onWarn: warn })) {
				const existing = blocks.get(name);
				// CSS layered over an object definition merges rather than replaces,
				// so a caller can declare structure in TypeScript and let a novel's
				// stylesheet override the appearance.
				self.define(name, existing ? { ...existing, ...block } : block);
			}
			return self;
		},

		bind(tag, name) {
			bindings.set(tag, name);
			return self;
		},

		get: (name) => blocks.get(name),

		resolve(name) {
			const hit = resolved.get(name);
			if (hit) return hit;

			const chain: StyleBlock[] = [];
			const seen = new Set<string>();
			let current: string | undefined = name;
			while (current !== undefined && !seen.has(current) && chain.length < MAX_BASED_ON_DEPTH) {
				seen.add(current);
				const block = blocks.get(current);
				if (!block) break;
				chain.push(block);
				current = block.basedOn;
			}

			// Root-first, so the most derived style wins.
			let out: StyleBlock = {};
			for (let i = chain.length - 1; i >= 0; i--) {
				const block = chain[i];
				for (const [key, value] of Object.entries(block)) {
					if (value === undefined) continue;
					if (i !== 0 && NOT_INHERITED.includes(key as keyof StyleBlock)) continue;
					if (key === "css") {
						out.css = { ...out.css, ...(value as Record<string, string>) };
						continue;
					}
					(out as Record<string, unknown>)[key] = value;
				}
			}
			out = { displayName: name, ...out };

			resolved.set(name, out);
			return out;
		},

		nameFor(node: Node) {
			const own = (node.data as { style?: unknown })?.style;
			if (typeof own === "string" && own !== "") return own;
			return bindings.get(node.tag);
		},

		idFor: (name) => toPascalCase(name),
		classFor: (name) => blocks.get(name)?.className ?? toKebabCase(name),

		get entries() {
			return [...blocks.entries()];
		},

		options: { baseFontSize },

		table(): StyleTable {
			const defs: StyleDef[] = [...blocks.keys()].map((name) => {
				const block = self.resolve(name);
				const def: StyleDef = {
					id: self.idFor(name),
					name: block.displayName ?? name,
					type: block.family === "text" ? "character" : "paragraph",
					style: toResolvedStyle(name, block),
				};
				if (block.basedOn) def.basedOn = self.idFor(block.basedOn);
				return def;
			});
			return createStyleTable(defs);
		},
	};

	return self;
}

/** The base font size of a registry, in points, for the length converters. */
export function basePoints(styles: DocumentStyles): number {
	return toPoints(parseLength(styles.options.baseFontSize), 12) ?? 12;
}
