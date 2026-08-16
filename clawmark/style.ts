/**
 * @module
 * Normalized style resolution.
 *
 * This is the piece that makes docx and odt tractable at all. A rule must not
 * have to know that a heading is `<w:pPr><w:pStyle w:val="Heading1"/>` in one
 * format and `<text:h text:outline-level="1">` in another - it asks for a
 * `ResolvedStyle` and matches on that.
 */

import type { ResolvedStyle, StyleDef, StyleTable, TokenIdentifier } from "./types.ts";
import type { StyleFamily, StyleSink, StyleSinkOptions } from "./types.ts";
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
 * Heuristics mapping well-known style names to normalized roles, shared by the
 * docx and odt profiles.
 *
 * In docx these cover documents supplied without a styles.xml; in odt they are
 * the *only* way a `Title`/`Subtitle`/`Heading N` styled paragraph is
 * recognized at all - plenty of real exports (Google Docs among them) write
 * heading-styled `<text:p>` elements with an empty
 * `style:default-outline-level` instead of `<text:h>`.
 */
const NAME_HEURISTICS: [RegExp, ResolvedStyle][] = [
	[/^title$/i, { blockRole: "heading", headingLevel: 1 }],
	[/^subtitle$/i, { blockRole: "heading", headingLevel: 2 }],
	[/^(intense\s*)?quote$/i, { blockRole: "quote" }],
	[/^block\s*text$/i, { blockRole: "quote" }],
	[/^(source\s*)?code$/i, { blockRole: "code", mono: true }],
	[/^html\s*preformatted$/i, { blockRole: "code", mono: true }],
	// LibreOffice's name for the same thing, and what it writes into every odt
	// containing a code block.
	[/^preformatted(\s*text)?$/i, { blockRole: "code", mono: true }],
	[/^list\s*paragraph$/i, { blockRole: "list" }],
];

/** Maps a style name or id to a normalized style using the built-in heuristics. */
export function styleFromName(name: string): ResolvedStyle {
	const heading = /^heading\s*([1-6])$/i.exec(name);
	if (heading) {
		return { blockRole: "heading", headingLevel: Number(heading[1]) };
	}
	for (const [pattern, style] of NAME_HEURISTICS) {
		if (pattern.test(name)) return { ...style };
	}
	return {};
}

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

/**
 * The nested wrap chain (outermost first) for a style's character formatting.
 * One styled span/run can carry several formattings at once; a first-match
 * cascade of single-property rules keeps only one and silently drops the rest.
 */
export function emphasisTags(style: ResolvedStyle): TokenIdentifier[] {
	const out: TokenIdentifier[] = [];
	if (style.underline) out.push("md:underline");
	if (style.strike) out.push("md:strikethrough");
	if (style.highlight) out.push("md:highlight");
	if (style.bold && style.italic) out.push("md:bolditalic");
	else if (style.bold) out.push("md:bold");
	else if (style.italic) out.push("md:italic");
	return out;
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

/**
 * Properties that identify a style for dedup purposes, in a fixed order.
 *
 * Fixed order matters: the canonical key is built by walking this list, so two
 * styles that differ only in the order their properties were assigned hash the
 * same.
 *
 * `named` is in the list because on the write side it is an *input*: an
 * automatic paragraph style records the common style it derives from, so
 * `{ breakBefore: "page", named: "Standard" }` and
 * `{ breakBefore: "page", named: "Quote" }` are two different styles that must
 * not collapse onto one definition. This is not the sink keying on the name it
 * hands back - that is still `options.name()`'s business and never enters the
 * key.
 */
const SINK_KEYS: readonly (keyof ResolvedStyle)[] = [
	"named",
	"charStyle",
	"blockRole",
	"headingLevel",
	"bold",
	"italic",
	"strike",
	"underline",
	"mono",
	"highlight",
	"align",
	"breakBefore",
	"breakAfter",
];

function sinkKey(style: ResolvedStyle, family: StyleFamily): string {
	const parts: string[] = [family];
	for (const key of SINK_KEYS) {
		const value = style[key];
		if (value !== undefined) parts.push(`${key}=${String(value)}`);
	}
	if (style.list) {
		const { kind, level, checked, id } = style.list;
		parts.push(`list=${kind}/${level}/${checked ?? ""}/${id ?? ""}`);
	}
	if (style.ext) {
		for (const key of Object.keys(style.ext).sort()) {
			parts.push(`ext.${key}=${JSON.stringify(style.ext[key])}`);
		}
	}
	return parts.join("|");
}

const DEFAULT_PREFIX: Record<StyleFamily, string> = {
	paragraph: "P",
	text: "T",
	list: "L",
	table: "Table",
};

/**
 * The write-side inverse of `createStyleTable`: hand it a normalized style,
 * get back the name a document should reference for it.
 *
 * Two identical bold runs must share one definition or an odt grows a fresh
 * `<style:style>` per run, so lookups are deduped on a canonical key. A
 * profile supplies `name()` to pin well-known styles - a heading should
 * reference `Heading_20_1`, not whatever counter value it happened to land on -
 * and generated names fall back to a per-family prefix plus a counter.
 *
 * Names are handed out in first-use order, so output is deterministic for a
 * given input tree. That is what makes the round-trip tests assertable.
 */
export function createStyleSink(options: StyleSinkOptions = {}): StyleSink {
	const byKey = new Map<string, string>();
	const defs: StyleDef[] = [];
	const counters: Partial<Record<StyleFamily, number>> = {};
	const taken = new Set<string>();

	return {
		ensure(style, family = "text") {
			const key = sinkKey(style, family);
			const hit = byKey.get(key);
			if (hit !== undefined) return hit;

			let name = options.name?.(style, family);
			if (name === undefined || taken.has(name)) {
				const prefix = options.prefix?.[family] ?? DEFAULT_PREFIX[family];
				do {
					counters[family] = (counters[family] ?? 0) + 1;
					name = `${prefix}${counters[family]}`;
				} while (taken.has(name));
			}

			taken.add(name);
			byKey.set(key, name);
			const def: StyleDef = {
				id: name,
				type: family === "text" ? "character" : family,
				style,
			};
			// An automatic style derives from a common one, and `named` is how the
			// caller says which. Recording it as `basedOn` keeps the emitted defs
			// readable by `createStyleTable` without a second convention.
			if (style.named !== undefined && style.named !== name) def.basedOn = style.named;
			defs.push(def);
			return name;
		},
		get defs() {
			return defs;
		},
	};
}
