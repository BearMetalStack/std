/**
 * @module
 * The odt (OpenDocument text) profile.
 *
 * Structurally friendlier than docx: headings and lists *can* be real elements
 * (`<text:h text:outline-level>`, `<text:list>/<text:list-item>`) - but real
 * exports are not that tidy. Google Docs, for one, writes headings as
 * `<text:p>` with a `Title`/`Subtitle`/`Heading N` paragraph style and an
 * *empty* `style:default-outline-level`, so styled paragraphs are matched by
 * name heuristics exactly as in docx.
 *
 * Same scope boundary as docx - this does not unzip an `.odt`. Hand over
 * `content.xml` as the document, and optionally `styles.xml`:
 *
 * ```ts
 * const md = xmlToMarkdown(contentXml, odtProfile({ styles }));
 * ```
 *
 * The `<office:automatic-styles>` of the crawled document itself (the
 * generated `T1`/`P2` names carrying the formatting an author applied
 * directly) are indexed when the crawl reaches them, so they never need to be
 * passed separately.
 */

import type { AnyReverseRule, MatchContext, Node, Profile, StyleTable } from "../../types.ts";
import type { ResolvedStyle, StyleDef, StyleResolver } from "../../types.ts";
import type { XmlElement } from "../../xml/types.ts";
import { createStyleTable, emphasisTags, lookupAttr, styleFromName } from "../../style.ts";
import { XmlParser } from "../../xml/parser.ts";
import { defaultRules } from "../../rules/mod.ts";
import { on } from "../../dsl.ts";
import { buildQuote, codeBlockValue, takeParagraphRun } from "../office.ts";

export * from "./write.ts";

const CODE_CONSUMED = "odt:code-consumed";
const QUOTE_CONSUMED = "odt:quote-consumed";

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

/** Links a freshly built node into `parent` and returns it. */
function appendChild(parent: Node, node: Node): Node {
	node.parent = parent;
	parent.children.push(node);
	return node;
}

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

/** Decodes ODF's `_XX_` hex escapes: `Heading_20_1` is "Heading 1". */
function decodeStyleName(name: string): string {
	return name.replace(/_([0-9a-fA-F]{2})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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

const BREAK_KINDS = new Set(["page", "column"]);

/** Reads `<style:paragraph-properties>` into a normalized style. */
function paragraphProperties(props: XmlElement | undefined): ResolvedStyle {
	if (!props) return {};
	const out: ResolvedStyle = {};
	const before = lookupAttr(props, "break-before");
	if (before && BREAK_KINDS.has(before)) out.breakBefore = before as "page" | "column";
	const after = lookupAttr(props, "break-after");
	if (after && BREAK_KINDS.has(after)) out.breakAfter = after as "page" | "column";
	return out;
}

/** Reads every `<style:style>` under `root` into style definitions. */
function styleDefsFrom(root: XmlElement): StyleDef[] {
	const defs: StyleDef[] = [];
	for (const el of descendants(root, "style")) {
		const id = lookupAttr(el, "name");
		if (!id) continue;
		const display = lookupAttr(el, "display-name") ?? decodeStyleName(id);
		const family = lookupAttr(el, "family");
		const parent = lookupAttr(el, "parent-style-name");

		// Block roles only make sense for paragraph styles - a *text* style
		// named "Title" must not turn its span into a heading.
		const style: ResolvedStyle = {
			named: id,
			...(family === undefined || family === "paragraph" ? styleFromName(display) : {}),
			...paragraphProperties(firstChild(el, "paragraph-properties")),
			...textProperties(firstChild(el, "text-properties")),
		};
		// An explicit outline level beats the name heuristic. Google Docs
		// writes `default-outline-level=""` on every heading style, so only a
		// non-empty value counts.
		const outline = lookupAttr(el, "default-outline-level");
		if (outline) {
			style.blockRole = "heading";
			style.headingLevel = Number(outline);
		}

		const def: StyleDef = { id, style };
		if (display !== id) def.name = display;
		// style:parent-style-name is odt's basedOn - same machinery.
		if (parent) def.basedOn = parent;
		defs.push(def);
	}
	return defs;
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
		defs.push(...styleDefsFrom(root));
	}
	return createStyleTable(defs);
}

/** Per-level list kinds, keyed by list style name then `text:level`. */
export type OdtListStyles = Map<string, Map<number, "ordered" | "unordered">>;

function collectListStyles(root: XmlElement, out: OdtListStyles): void {
	for (const el of descendants(root, "list-style")) {
		const name = lookupAttr(el, "name");
		if (!name) continue;
		const levels = new Map<number, "ordered" | "unordered">();
		for (const child of el.children) {
			if (child.kind !== "element" || !child.name.startsWith("list-level-style")) continue;
			const level = Number(lookupAttr(child, "level") ?? "1");
			levels.set(level, child.name === "list-level-style-number" ? "ordered" : "unordered");
		}
		out.set(name, levels);
	}
}

/**
 * Maps a list style name to ordered/unordered, **per nesting level**.
 *
 * Per level is not optional: exporters routinely define all ten levels, and
 * they need not agree - Google Docs writes bulleted lists whose levels 1-9 are
 * `list-level-style-bullet` while level 10 is `list-level-style-number`. Any
 * whole-style answer turns every bulleted list in such a document ordered.
 */
export function odtListStyles(...sources: (string | XmlElement | undefined)[]): OdtListStyles {
	const out: OdtListStyles = new Map();
	for (const source of sources) {
		const root = parseIfString(source);
		if (!root) continue;
		collectListStyles(root, out);
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
	/**
	 * `content.xml`, when its automatic styles must be indexed up front.
	 * Rarely needed: the crawl indexes the document's own
	 * `<office:automatic-styles>` when it reaches them, which is before any
	 * body element resolves a style.
	 */
	content?: string | XmlElement;
	rules?: AnyReverseRule[];
}

/** A profile that turns OpenDocument text back into markdown. */
export function odtProfile(parts: OdtParts = {}): Profile {
	// The table is rebuilt on the fly because the crawled document contributes
	// its own automatic styles mid-crawl. Later definitions win on id
	// collision, so document styles override a styles.xml entry of the same
	// name - those carry the direct formatting an author actually applied.
	const defs: StyleDef[] = [];
	let table = createStyleTable(defs);
	const addDefs = (more: StyleDef[]) => {
		if (more.length === 0) return;
		defs.push(...more);
		table = createStyleTable(defs);
	};
	const live: StyleTable = {
		get: (key) => table.get(key),
		resolve: (key) => table.resolve(key),
		get defaults() {
			return table.defaults;
		},
	};
	const listStyles: OdtListStyles = new Map();
	/** Note bodies harvested at their reference, emitted after the body. */
	const noteBodies: { id: string; body: XmlElement }[] = [];
	for (const source of [parts.styles, parts.content]) {
		const root = parseIfString(source);
		if (!root) continue;
		addDefs(styleDefsFrom(root));
		collectListStyles(root, listStyles);
	}

	const t = (tag: string | string[]) => on(tag, ODT_NS);

	/** The style the element references by name, without ancestor cascade. */
	const ownStyle = (el: XmlElement, ctx: MatchContext): ResolvedStyle => {
		const named = ctx.attr("style-name", el);
		return named ? live.resolve(named) : {};
	};

	const rules: AnyReverseRule[] = [
		...(parts.rules ?? []),

		// The document's own automatic styles (and, should a whole styles.xml
		// ever be crawled, its common styles) are harvested before dropping:
		// they hold the T1/P2 direct formatting the body is about to use.
		t(["office:automatic-styles", "office:styles"]).to((el) => {
			addDefs(styleDefsFrom(el));
			collectListStyles(el, listStyles);
			return { kind: "drop" };
		}),
		t("office:font-face-decls").drop(),
		t(["text:tracked-changes", "text:sequence-decls", "text:bookmark"]).drop(),
		// Accessibility metadata on a frame, not content.
		t(["svg:title", "svg:desc"]).drop(),

		// The body is claimed so footnote definitions can be appended after the
		// document proper: ODF holds a note's text inline at the reference, but
		// the clawmark tree wants a definition at the end.
		t("office:text").to((el) => ({
			kind: "custom",
			run(parent, ctx) {
				ctx.crawlChildren(parent, el);
				for (const note of noteBodies) {
					const def: Node = {
						tag: "md:footnotedef",
						data: { id: note.id, phase: "open" },
						children: [],
						parent,
					};
					parent.children.push(def);
					ctx.crawlChildren(def, note.body);
				}
			},
		})),

		t("text:note").to((el, ctx) => {
			const citation = ctx.child("note-citation", el);
			const body = ctx.child("note-body", el);
			const id = (citation && ctx.text(citation)) || String(noteBodies.length + 1);
			if (body) noteBodies.push({ id, body });
			return { kind: "leaf", tag: "md:footnote", data: { id } };
		}),

		t("text:h").wrap("md:heading", (el, ctx) => ({
			level: Number(ctx.attr("outline-level", el) ?? ctx.style.headingLevel ?? 1),
			phase: "open",
		})),

		// A paragraph inside a list item is the item's content, not a block of
		// its own - unwrapping keeps the item tight. Its style's character
		// formatting still applies (an all-italic list is a real thing).
		t("text:p").where((_el, ctx) =>
			ctx.parentTag === "md:listitem" || ctx.parentTag === "md:checkitem"
		).to((el, ctx) => {
			const chain = emphasisTags(ownStyle(el, ctx));
			return chain.length === 0 ? { kind: "unwrap" } : { kind: "wrap", tag: chain };
		}),
		t("text:p").whereStyle((s) => s.blockRole === "heading").wrap(
			"md:heading",
			(_el, ctx) => ({ level: ctx.style.headingLevel ?? 1, phase: "open" }),
		),

		// An empty paragraph carrying only a bottom border is how ODF spells a
		// horizontal rule; LibreOffice names that style "Horizontal Line".
		t("text:p").where((el, ctx) => {
			const named = ctx.attr("style-name", el);
			return named !== undefined &&
				/^horizontal\s*line$/i.test(decodeStyleName(named)) &&
				ctx.text(el) === "";
		}).emit("md:hr"),

		// Blockquotes and code blocks are runs of styled paragraphs here just as
		// they are in docx - ODF has an element for a list but not for either of
		// these. The first paragraph of a run claims all of them.
		t("text:p").whereStyle((s) => s.blockRole === "quote").to((el, ctx) => {
			const run = takeParagraphRun(el, ctx, QUOTE_CONSUMED, (s) => s.blockRole === "quote");
			return run ? { kind: "custom", run: buildQuote(run) } : { kind: "drop" };
		}),
		t("text:p").whereStyle((s) => s.blockRole === "code").to((el, ctx) => {
			const run = takeParagraphRun(el, ctx, CODE_CONSUMED, (s) => s.blockRole === "code");
			if (!run) return { kind: "drop" };
			return { kind: "leaf", tag: "md:codeblock", data: { value: codeBlockValue(run, ctx) } };
		}),
		// ODF has no page-break element, so a break is `fo:break-before` on a
		// paragraph style, and producers disagree about which paragraph carries
		// it: clawmark's own writer emits an empty one, while LibreOffice puts
		// the property on the paragraph *following* the break. Both are read
		// here - the empty form becomes a bare `md:pagebreak`, the loaded form
		// becomes a break plus the paragraph it was attached to.
		//
		// Deliberately below the heading/quote/code rules: a break on a
		// heading-styled paragraph keeps the heading and loses the break, which
		// is the less destructive of the two ways to get that wrong.
		t("text:p").whereStyle((s) => s.breakBefore !== undefined).to((el, ctx) => {
			const kind = ctx.style.breakBefore;
			if (ctx.text(el) === "") {
				return { kind: "leaf", tag: "md:pagebreak", data: { kind } };
			}
			const emphasis = emphasisTags(ownStyle(el, ctx));
			return {
				kind: "custom",
				run(parent, inner) {
					appendChild(parent, { tag: "md:pagebreak", data: { kind }, children: [] });
					const p = appendChild(parent, {
						tag: "core:paragraph",
						data: { phase: "open" },
						children: [],
					});
					let target = p;
					for (const tag of emphasis) {
						target = appendChild(target, { tag, data: {}, children: [] });
					}
					inner.crawlChildren(target, el);
				},
			};
		}),

		t("text:p").to((el, ctx) => ({
			kind: "wrap",
			tag: ["core:paragraph", ...emphasisTags(ownStyle(el, ctx))],
			data: { phase: "open" },
		})),

		t("text:list").to((el, ctx) => {
			// Nested <text:list> elements usually leave style-name to the
			// outermost one; the nearest named ancestor list carries it.
			let name = ctx.attr("style-name", el);
			if (!name) {
				for (let i = ctx.ancestors.length - 1; i >= 0 && !name; i--) {
					const a = ctx.ancestors[i];
					if (a.name === "list") name = lookupAttr(a, "style-name");
				}
			}
			const depth = ctx.ancestors.filter((a) => a.name === "list").length + 1;
			const levels = name ? listStyles.get(name) : undefined;
			const kind = levels?.get(depth) ?? levels?.get(1) ?? "unordered";
			return {
				kind: "wrap",
				tag: kind === "ordered" ? "md:orderedlist" : "md:unorderedlist",
				data: { phase: "open" },
			};
		}),
		t("text:list-item").wrap("md:listitem", { phase: "open" }),
		t("text:list-header").wrap("md:listitem", { phase: "open" }),

		// Character styles resolve through the style table. Deliberately the
		// span's *own* style, not the ancestor cascade: paragraph-level
		// formatting is already wrapped by the paragraph rules above, and
		// re-matching it here would nest the same emphasis twice.
		t("text:span").to((el, ctx) => {
			const own = ownStyle(el, ctx);
			if (own.mono) {
				return { kind: "leaf", tag: "md:code", data: { value: ctx.text(el) } };
			}
			const chain = emphasisTags(own);
			return chain.length === 0 ? { kind: "unwrap" } : { kind: "wrap", tag: chain };
		}),

		t("text:a").to((el, ctx) => ({
			kind: "leaf",
			tag: "md:link",
			data: { href: ctx.attr("href", el) ?? "#", text: ctx.text(el) },
		})),
		// ODF puts an image's alternative text in an `<svg:title>` on the
		// enclosing frame, not on the image itself.
		t("draw:image").to((el, ctx) => {
			const frame = el.parent;
			const title = frame && (ctx.child("title", frame) ?? ctx.child("desc", frame));
			const alt = title && ctx.text(title);
			const data: Record<string, unknown> = { src: ctx.attr("href", el) ?? "" };
			if (alt) data.alt = alt;
			return { kind: "leaf", tag: "md:image", data };
		}),
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
		styleTable: live,
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
