/**
 * @module
 * Normalized style resolution.
 *
 * This is the piece that makes docx and odt tractable at all. A rule must not
 * have to know that a heading is `<w:pPr><w:pStyle w:val="Heading1"/>` in one
 * format and `<text:h text:outline-level="1">` in another - it asks for a
 * `ResolvedStyle` and matches on that.
 */

import type { ResolvedStyle, StyleDef, StyleTable } from "./types.ts";
import type { XmlElement } from "./xml/types.ts";

/**
 * Properties that cascade from an ancestor's resolved style.
 *
 * Character-level only, and that restriction is the single most important
 * constraint in the style system. If `blockRole`/`headingLevel`/`list`
 * inherited, every `<w:r>` inside a Heading1 paragraph would report
 * `blockRole: "heading"` and every heading matcher would fire on every run.
 */
export const DEFAULT_INHERITS: readonly (keyof ResolvedStyle)[] = [
	"bold",
	"italic",
	"strike",
	"underline",
	"mono",
	"highlight",
	"align",
];

/**
 * Attribute lookup tolerant of namespace-prefix variance: `lookupAttr(el,
 * "val")` finds `w:val`, `val`, or any other prefix binding. Producers are not
 * consistent about prefixes, and every docx matcher would otherwise open with
 * the same two-way `??` dance.
 */
export function lookupAttr(el: XmlElement | undefined, name: string): string | undefined {
	if (!el) return undefined;
	const exact = el.attrs.get(name);
	if (exact !== undefined) return exact;
	for (const [key, value] of el.attrs) {
		const colon = key.indexOf(":");
		if (colon > 0 && key.slice(colon + 1) === name) return value;
	}
	return undefined;
}

/**
 * Reads an OOXML/ODF on-off toggle. `<w:b/>` with no attribute means on;
 * `w:val="0"|"false"|"off"|"none"` means explicitly off.
 *
 * The explicit-off case is why `mergeStyle` has to distinguish `undefined`
 * from `false`: a run that switches bold *off* must override an inherited
 * bold, not be treated as saying nothing.
 */
export function onOff(el: XmlElement | undefined, attr = "val"): boolean | undefined {
	if (!el) return undefined;
	const value = lookupAttr(el, attr);
	if (value === undefined) return true;
	return !(value === "0" || value === "false" || value === "off" || value === "none");
}

/** Merges `over` onto `base`. `undefined` does not clobber; `false` does. */
export function mergeStyle(base: ResolvedStyle, over: ResolvedStyle): ResolvedStyle {
	const out: ResolvedStyle = { ...base };
	for (const [key, value] of Object.entries(over)) {
		if (value === undefined) continue;
		if (key === "ext") {
			out.ext = { ...out.ext, ...(value as Record<string, unknown>) };
			continue;
		}
		(out as Record<string, unknown>)[key] = value;
	}
	return out;
}

/** Picks a subset of properties, skipping any that are absent. */
export function pickStyle(
	style: ResolvedStyle,
	keys: readonly (keyof ResolvedStyle)[],
): ResolvedStyle {
	const out: ResolvedStyle = {};
	for (const key of keys) {
		const value = style[key];
		if (value !== undefined) (out as Record<string, unknown>)[key] = value;
	}
	return out;
}

const MAX_BASED_ON_DEPTH = 32;

/**
 * Builds a style table from a flat list of definitions, flattening `basedOn`
 * chains on demand.
 *
 * Indexed by **both** id and name, with id winning on collision. This is not
 * pedantry: docx separates `w:styleId` from `w:name`, and a non-English Word
 * installation writes a localized id (`Überschrift1`) alongside an English
 * name (`heading 1`). Index only one and every non-English document silently
 * loses its headings.
 *
 * The resolve walk is cycle-guarded and depth-capped because real documents in
 * the wild do contain `basedOn` cycles, and an unguarded walk simply hangs.
 */
export function createStyleTable(
	defs: StyleDef[],
	defaults: ResolvedStyle = {},
): StyleTable {
	const byKey = new Map<string, StyleDef>();
	for (const def of defs) {
		if (def.name && !byKey.has(def.name)) byKey.set(def.name, def);
	}
	for (const def of defs) byKey.set(def.id, def);

	const cache = new Map<string, ResolvedStyle>();

	function resolve(key: string): ResolvedStyle {
		const hit = cache.get(key);
		if (hit) return hit;

		const chain: StyleDef[] = [];
		const seen = new Set<string>();
		let current = byKey.get(key);
		while (current && !seen.has(current.id) && chain.length < MAX_BASED_ON_DEPTH) {
			seen.add(current.id);
			chain.push(current);
			current = current.basedOn ? byKey.get(current.basedOn) : undefined;
		}

		// Root-first, so the most derived style wins.
		let out: ResolvedStyle = { ...defaults };
		for (let i = chain.length - 1; i >= 0; i--) out = mergeStyle(out, chain[i].style);

		cache.set(key, out);
		return out;
	}

	return {
		get: (key) => byKey.get(key),
		resolve,
		defaults,
	};
}

/** A table with no definitions, for profiles that need no named styles. */
export const EMPTY_STYLE_TABLE: StyleTable = createStyleTable([]);
