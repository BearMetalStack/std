/**
 * @module
 * The odt (OpenDocument text) profile.
 *
 * Structurally friendlier than docx: headings and lists are real elements
 * (`<text:h text:outline-level>`, `<text:list>/<text:list-item>`) rather than
 * styled paragraphs, so only character formatting needs the style table.
 *
 * Same scope boundary as docx - this does not unzip an `.odt`. Hand over
 * `content.xml` as the document, and optionally `styles.xml`:
 *
 * ```ts
 * const md = xmlToMarkdown(contentXml, odtProfile({ styles }));
 * ```
 */

import type { AnyReverseRule, MatchContext, Node, Profile, StyleTable } from "../../types.ts";
import type { ResolvedStyle, StyleDef, StyleResolver } from "../../types.ts";
import type { XmlElement } from "../../xml/types.ts";
import { createStyleTable, lookupAttr } from "../../style.ts";
import { XmlParser } from "../../xml/parser.ts";
import { defaultRules } from "../../rules/mod.ts";
import { on } from "../../dsl.ts";

export const TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
export const STYLE_NS = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
export const OFFICE_NS = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
export const FO_NS = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0";
export const TABLE_NS = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
export const DRAW_NS = "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0";
export const XLINK_NS = "http://www.w3.org/1999/xlink";

export const ODT_NS: Record<string, string> = {
	text: TEXT_NS,
	style: STYLE_NS,
	office: OFFICE_NS,
	fo: FO_NS,
	table: TABLE_NS,
	draw: DRAW_NS,
	xlink: XLINK_NS,
};

const MONO_RX = /mono|courier|consolas|menlo/i;

function parseIfString(source: string | XmlElement | undefined): XmlElement | undefined {
	if (source === undefined) return undefined;
	return typeof source === "string" ? new XmlParser(source, { mode: "xml" }).parse() : source;
}

function descendants(el: XmlElement, localName: string): XmlElement[] {
	const out: XmlElement[] = [];
	const walk = (node: XmlElement) => {
		for (const child of node.children) {
			if (child.kind !== "element") continue;
			if (child.name === localName) out.push(child);
			walk(child);
		}
	};
	walk(el);
	return out;
}

function firstChild(el: XmlElement | undefined, localName: string): XmlElement | undefined {
	return el?.children.find(
		(c): c is XmlElement => c.kind === "element" && c.name === localName,
	);
}

/** Reads `<style:text-properties>` into a normalized style. */
function textProperties(props: XmlElement | undefined): ResolvedStyle {
	if (!props) return {};
	const out: ResolvedStyle = {};
	const weight = lookupAttr(props, "font-weight");
	if (weight) out.bold = /^(bold|[6-9]00)$/i.test(weight);
	const posture = lookupAttr(props, "font-style");
	if (posture) out.italic = /^(italic|oblique)$/i.test(posture);
	const strike = lookupAttr(props, "text-line-through-style");
	if (strike) out.strike = strike !== "none";
	const underline = lookupAttr(props, "text-underline-style");
	if (underline) out.underline = underline !== "none";
	const family = lookupAttr(props, "font-name") ?? lookupAttr(props, "font-family");
	if (family && MONO_RX.test(family)) out.mono = true;
	const highlight = lookupAttr(props, "background-color");
	if (highlight) out.highlight = highlight !== "transparent";
	return out;
}

/**
 * Builds a style table from `<office:automatic-styles>` and `<office:styles>`.
 *
 * Both `content.xml` and `styles.xml` contribute; automatic styles (the
 * generated `T1`, `P2` names) win, since those carry the direct formatting an
 * author actually applied.
 */
export function odtStyleTable(...sources: (string | XmlElement | undefined)[]): StyleTable {
	const defs: StyleDef[] = [];
	for (const source of sources) {
		const root = parseIfString(source);
		if (!root) continue;
		for (const el of descendants(root, "style")) {
			const id = lookupAttr(el, "name");
			if (!id) continue;
			const parent = lookupAttr(el, "parent-style-name");
			const def: StyleDef = {
				id,
				style: { named: id, ...textProperties(firstChild(el, "text-properties")) },
			};
			// style:parent-style-name is odt's basedOn - same machinery.
			if (parent) def.basedOn = parent;
			defs.push(def);
		}
	}
	return createStyleTable(defs);
}

/** Maps a list style name to ordered/unordered. */
export function odtListStyles(
	...sources: (string | XmlElement | undefined)[]
): Map<string, "ordered" | "unordered"> {
	const out = new Map<string, "ordered" | "unordered">();
	for (const source of sources) {
		const root = parseIfString(source);
		if (!root) continue;
		for (const el of descendants(root, "list-style")) {
			const name = lookupAttr(el, "name");
			if (!name) continue;
			const numbered = el.children.some(
				(c) => c.kind === "element" && c.name === "list-level-style-number",
			);
			out.set(name, numbered ? "ordered" : "unordered");
		}
	}
	return out;
}

export function odtStyleResolver(): StyleResolver {
	return {
		own(el: XmlElement, table: StyleTable): ResolvedStyle {
			const named = lookupAttr(el, "style-name");
			if (!named) return {};
			return { ...table.resolve(named), named };
		},
	};
}

export interface OdtParts {
	/** `styles.xml`; `content.xml` is passed as the document itself. */
	styles?: string | XmlElement;
	/** `content.xml`, when its automatic styles must be indexed up front. */
	content?: string | XmlElement;
	rules?: AnyReverseRule[];
}

/** A profile that turns OpenDocument text back into markdown. */
export function odtProfile(parts: OdtParts = {}): Profile {
	const table = odtStyleTable(parts.styles, parts.content);
	const listStyles = odtListStyles(parts.styles, parts.content);
	const t = (tag: string | string[]) => on(tag, ODT_NS);

	const rules: AnyReverseRule[] = [
		...(parts.rules ?? []),

		t(["office:automatic-styles", "office:styles", "office:font-face-decls"]).drop(),
		t(["text:tracked-changes", "text:sequence-decls", "text:bookmark"]).drop(),

		t("text:h").wrap("md:heading", (el, ctx) => ({
			level: Number(ctx.attr("outline-level", el) ?? "1"),
			phase: "open",
		})),

		// A paragraph inside a list item is the item's content, not a block of
		// its own - unwrapping keeps the item tight.
		t("text:p").where((_el, ctx) =>
			ctx.parentTag === "md:listitem" || ctx.parentTag === "md:checkitem"
		).unwrap(),
		t("text:p").whereStyle((s) => s.blockRole === "quote").wrap("md:blockquote", {
			phase: "open",
		}),
		t("text:p").wrap("core:paragraph", { phase: "open" }),

		t("text:list").to((el, ctx) => {
			const name = ctx.attr("style-name", el);
			const kind = (name && listStyles.get(name)) ?? "unordered";
			return {
				kind: "wrap",
				tag: kind === "ordered" ? "md:orderedlist" : "md:unorderedlist",
				data: { phase: "open" },
			};
		}),
		t("text:list-item").wrap("md:listitem", { phase: "open" }),
		t("text:list-header").wrap("md:listitem", { phase: "open" }),

		// Character styles resolve through the automatic-style table.
		t("text:span").whereStyle((s) => !!s.bold && !!s.italic).wrap("md:bolditalic"),
		t("text:span").whereStyle((s) => !!s.bold).wrap("md:bold"),
		t("text:span").whereStyle((s) => !!s.italic).wrap("md:italic"),
		t("text:span").whereStyle((s) => !!s.strike).wrap("md:strikethrough"),
		t("text:span").whereStyle((s) => !!s.highlight).wrap("md:highlight"),
		t("text:span").whereStyle((s) => !!s.mono).to((el, ctx) => ({
			kind: "leaf",
			tag: "md:code",
			data: { value: ctx.text(el) },
		})),
		t("text:span").unwrap(),

		t("text:a").to((el, ctx) => ({
			kind: "leaf",
			tag: "md:link",
			data: { href: ctx.attr("href", el) ?? "#", text: ctx.text(el) },
		})),
		t("draw:image").to((el, ctx) => ({
			kind: "leaf",
			tag: "md:image",
			data: { src: ctx.attr("href", el) ?? "" },
		})),
		t("draw:frame").unwrap(),

		t("text:line-break").emit("md:linebreak"),
		// <text:s text:c="N"> is N literal spaces, so it bypasses collapsing.
		t("text:s").to((el, ctx) => ({
			kind: "nodes",
			nodes: [textNode(" ".repeat(Number(ctx.attr("c", el) ?? "1")))],
		})),
		t("text:tab").to(() => ({ kind: "nodes", nodes: [textNode(" ")] })),

		t("table:table").to((el, ctx) => ({ kind: "nodes", nodes: [buildTable(el, ctx)] })),

		...defaultRules(),
	];

	return {
		name: "odt",
		parse: { mode: "xml" },
		nsMap: ODT_NS,
		styles: odtStyleResolver(),
		styleTable: table,
		rules,
		unmatched: "unwrap",
	};
}

function textNode(value: string): Node {
	return { tag: "core:text", data: { value }, children: [] };
}

function buildTable(el: XmlElement, ctx: MatchContext): Node {
	const rows = ctx.findAll("table-row", el);
	const children: Node[] = rows.map((row) => ({
		tag: "md:tablerow",
		data: {
			columns: row.children
				.filter((c): c is XmlElement => c.kind === "element" && c.name === "table-cell")
				.map((cell) => ctx.text(cell)),
		},
		children: [],
	}));
	const columns = Math.max(
		0,
		...children.map((r) => (r.data as { columns: string[] }).columns.length),
	);
	if (children.length > 1) {
		children.splice(1, 0, {
			tag: "md:tableformat",
			data: { columns: Array.from({ length: columns }, () => "l" as const) },
			children: [],
		});
	}
	return { tag: "md:table", data: { columns, phase: "open" }, children };
}
