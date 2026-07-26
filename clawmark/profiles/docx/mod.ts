/**
 * @module
 * The docx (WordprocessingML) profile.
 *
 * **Scope boundary:** this does not unzip a `.docx`. Shipping a ZIP/inflate
 * implementation would be the only binary code in clawmark and a much larger
 * project. Callers hand over the parts they need as strings:
 *
 * ```ts
 * const profile = docxProfile({ styles, numbering, rels });
 * const md = xmlToMarkdown(documentXml, profile);
 * ```
 *
 * Every part is optional. Without `styles.xml` the profile falls back to
 * matching `w:pStyle` values against the usual English style names, which
 * covers most real documents.
 */

import type { AnyReverseRule, MatchContext, Node, Profile } from "../../types.ts";
import type { XmlElement } from "../../xml/types.ts";
import { defaultRules } from "../../rules/mod.ts";
import { emphasisTags } from "../../style.ts";
import { on } from "../../dsl.ts";
import {
	DOCX_NS,
	docxNumbering,
	docxRelationships,
	docxStyleResolver,
	docxStyleTable,
} from "./styles.ts";

export * from "./styles.ts";

export interface DocxParts {
	/** `word/styles.xml`. */
	styles?: string | XmlElement;
	/** `word/numbering.xml` - decides ordered vs bulleted. */
	numbering?: string | XmlElement;
	/** `word/_rels/document.xml.rels` - hyperlink and image targets. */
	rels?: string | XmlElement;
	/** Extra rules, consulted before the built-ins. */
	rules?: AnyReverseRule[];
}

const CONSUMED = "docx:consumed";

/** Marks paragraphs a list matcher has already swallowed. */
function consumed(ctx: MatchContext): Set<XmlElement> {
	let set = ctx.state.get(CONSUMED) as Set<XmlElement> | undefined;
	if (!set) {
		set = new Set();
		ctx.state.set(CONSUMED, set);
	}
	return set;
}

/**
 * Reconstructs a nested list from a run of sibling `<w:p>` elements.
 *
 * docx has no list *element* at all - a list is just consecutive paragraphs
 * that happen to carry a `<w:numPr>` with an `<w:ilvl>`. So the first such
 * paragraph claims the whole run, builds the nesting from the ilvl sequence,
 * and marks the rest consumed so the crawler skips them.
 */
function buildList(el: XmlElement): (parent: Node, ctx: MatchContext) => void {
	return (parent, matchCtx) => {
		const seen = consumed(matchCtx);
		const siblings = (el.parent?.children ?? []).filter(
			(c): c is XmlElement => c.kind === "element" && c.name === "p",
		);
		const start = siblings.indexOf(el);

		// Collect the maximal run of list paragraphs starting here.
		const run: { element: XmlElement; level: number; kind: "ordered" | "unordered" }[] = [];
		for (let i = start; i < siblings.length; i++) {
			const style = matchCtx.styleOf(siblings[i]);
			if (!style.list) break;
			run.push({
				element: siblings[i],
				level: style.list.level,
				kind: style.list.kind === "check" ? "unordered" : style.list.kind,
			});
		}
		if (run.length === 0) return;
		for (const entry of run) seen.add(entry.element);

		// A stack of open lists, one per indent level.
		const stack: { level: number; node: Node }[] = [];
		for (const entry of run) {
			while (stack.length > 0 && stack[stack.length - 1].level > entry.level) stack.pop();

			let top = stack[stack.length - 1];
			if (!top || top.level < entry.level) {
				const host = top ? top.node.children[top.node.children.length - 1] ?? top.node : parent;
				const list: Node = {
					tag: entry.kind === "ordered" ? "md:orderedlist" : "md:unorderedlist",
					data: { phase: "open" },
					children: [],
					parent: host,
				};
				host.children.push(list);
				top = { level: entry.level, node: list };
				stack.push(top);
			}

			const item: Node = {
				tag: "md:listitem",
				data: { phase: "open" },
				children: [],
				parent: top.node,
			};
			top.node.children.push(item);
			matchCtx.crawlChildren(item, entry.element);
		}
	};
}

/** A profile that turns WordprocessingML back into markdown. */
export function docxProfile(parts: DocxParts = {}): Profile {
	const numbering = docxNumbering(parts.numbering);
	const rels = docxRelationships(parts.rels);
	const table = docxStyleTable(parts.styles);
	const w = (tag: string | string[]) => on(tag, DOCX_NS);

	const rules: AnyReverseRule[] = [
		...(parts.rules ?? []),

		// Structural noise, dropped before anything else looks at it.
		w([
			"w:sectPr",
			"w:proofErr",
			"w:bookmarkStart",
			"w:bookmarkEnd",
			"w:lastRenderedPageBreak",
			"w:pPr",
			"w:rPr",
			"w:tblPr",
			"w:tblGrid",
			"w:trPr",
			"w:tcPr",
		]).drop(),

		// A paragraph already swallowed by a preceding list run.
		w("w:p").where((el, ctx) => consumed(ctx).has(el)).drop(),

		// Lists: the first paragraph of a run claims all of them.
		w("w:p").whereStyle((s) => s.list !== undefined).to((el) => ({
			kind: "custom",
			run: buildList(el),
		})),

		w("w:p").whereStyle((s) => s.blockRole === "heading").wrap(
			"md:heading",
			(_el, ctx) => ({ level: ctx.style.headingLevel ?? 1, phase: "open" }),
		),
		w("w:p").whereStyle((s) => s.blockRole === "quote").wrap("md:blockquote", {
			phase: "open",
		}),
		w("w:p").whereStyle((s) => s.blockRole === "code").to((el, ctx) => ({
			kind: "leaf",
			tag: "md:codeblock",
			data: { value: ctx.text(el) },
		})),
		w("w:p").wrap("core:paragraph", { phase: "open" }),

		// Runs carry the character formatting. Mono wins outright (a code span
		// cannot nest emphasis in markdown); everything else composes into one
		// nested chain so a bold *and* underlined run keeps both.
		w("w:r").whereStyle((s) => !!s.mono).to((el, ctx) => ({
			kind: "leaf",
			tag: "md:code",
			data: { value: ctx.text(el) },
		})),
		w("w:r").to((_el, ctx) => {
			const chain = emphasisTags(ctx.style);
			return chain.length === 0 ? { kind: "unwrap" } : { kind: "wrap", tag: chain };
		}),

		// `xml:space="preserve"` means the run's spacing is deliberate, so the
		// text node is built directly rather than going through the crawler's
		// whitespace collapsing.
		w("w:t").to((el, ctx) =>
			el.attrs.get("xml:space") === "preserve"
				? { kind: "nodes", nodes: [textNode(ctx.raw(el))] }
				: { kind: "unwrap" }
		),
		w("w:tab").to(() => ({ kind: "nodes", nodes: [textNode(" ")] })),
		w("w:br").emit("md:linebreak"),

		w("w:hyperlink").to((el, ctx) => {
			const id = ctx.attr("id", el);
			const href = (id && rels.get(id)) ?? ctx.attr("anchor", el) ?? "#";
			return { kind: "leaf", tag: "md:link", data: { href, text: ctx.text(el) } };
		}),

		w("w:tbl").to((el, ctx) => ({ kind: "nodes", nodes: [buildTable(el, ctx)] })),

		...defaultRules(),
	];

	return {
		name: "docx",
		parse: { mode: "xml" },
		nsMap: DOCX_NS,
		styles: docxStyleResolver(numbering),
		styleTable: table,
		rules,
		unmatched: "unwrap",
	};
}

function textNode(value: string): Node {
	return { tag: "core:text", data: { value }, children: [] };
}

/** `<w:tbl>` -> md:table, flattening every cell to plain text. */
function buildTable(el: XmlElement, ctx: MatchContext): Node {
	const rows = ctx.findAll("tr", el);
	const children: Node[] = rows.map((row) => ({
		tag: "md:tablerow",
		data: {
			columns: row.children
				.filter((c): c is XmlElement => c.kind === "element" && c.name === "tc")
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
