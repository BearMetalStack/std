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
import { emphasisTags, lookupAttr } from "../../style.ts";
import { on } from "../../dsl.ts";
import {
	buildQuote,
	codeBlockValue,
	markSet,
	siblingParagraphs,
	takeParagraphRun,
} from "../office.ts";
import {
	descendants,
	DOCX_NS,
	docxNumbering,
	docxRelationships,
	docxStyleResolver,
	docxStyleTable,
	parseIfString,
} from "./styles.ts";

export * from "./styles.ts";
export * from "./write.ts";

export interface DocxParts {
	/** `word/styles.xml`. */
	styles?: string | XmlElement;
	/** `word/numbering.xml` - decides ordered vs bulleted. */
	numbering?: string | XmlElement;
	/** `word/_rels/document.xml.rels` - hyperlink and image targets. */
	rels?: string | XmlElement;
	/** `word/footnotes.xml`. Without it, footnote references are dropped. */
	footnotes?: string | XmlElement;
	/** Extra rules, consulted before the built-ins. */
	rules?: AnyReverseRule[];
}

const CONSUMED = "docx:consumed";
const CODE_CONSUMED = "docx:code-consumed";
const QUOTE_CONSUMED = "docx:quote-consumed";

/** Marks paragraphs a list matcher has already swallowed. */
function consumed(ctx: MatchContext): Set<XmlElement> {
	return markSet(ctx, CONSUMED);
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
		const siblings = siblingParagraphs(el);
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
	const footnoteRoot = parseIfString(parts.footnotes);
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

		// The body is claimed so footnote definitions can be appended after the
		// document proper: they live in a different part, and the crawler only
		// ever walks one.
		w("w:body").to((el) => ({
			kind: "custom",
			run(parent, ctx) {
				ctx.crawlChildren(parent, el);
				if (!footnoteRoot) return;
				for (const note of descendants(footnoteRoot, "footnote")) {
					const id = lookupAttr(note, "id");
					// Ids below 1 are the separator and continuation-separator
					// notes every producer writes; they are not content.
					if (!id || !/^\d+$/.test(id) || Number(id) < 1) continue;
					const def: Node = {
						tag: "md:footnotedef",
						data: { id, phase: "open" },
						children: [],
						parent,
					};
					parent.children.push(def);
					ctx.crawlChildren(def, note);
				}
			},
		})),

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
		// Like lists and code, a blockquote is a *run* of styled paragraphs -
		// docx has no element for one. The first claims the run and turns each
		// paragraph into an `md:lineitem`, which is the shape the forward lexer
		// builds and what the serializer expects to prefix with `> `.
		w("w:p").whereStyle((s) => s.blockRole === "quote").to((el, ctx) => {
			const run = takeParagraphRun(el, ctx, QUOTE_CONSUMED, (s) => s.blockRole === "quote");
			return run ? { kind: "custom", run: buildQuote(run) } : { kind: "drop" };
		}),
		// docx has no multi-line paragraph - `<w:t>` cannot hold a newline - so a
		// code block arrives as a run of consecutive code-styled paragraphs, the
		// same shape a list arrives in. The first one claims the whole run and
		// rejoins the lines; the rest are marked consumed.
		w("w:p").whereStyle((s) => s.blockRole === "code").to((el, ctx) => {
			const run = takeParagraphRun(el, ctx, CODE_CONSUMED, (s) => s.blockRole === "code");
			if (!run) return { kind: "drop" };
			return { kind: "leaf", tag: "md:codeblock", data: { value: codeBlockValue(run, ctx) } };
		}),

		// An empty paragraph whose only property is a border is how every
		// producer writes a horizontal rule.
		w("w:p").where((el, ctx) => {
			const pPr = ctx.child("pPr", el);
			return pPr !== undefined && ctx.child("pBdr", pPr) !== undefined && ctx.text(el) === "";
		}).emit("md:hr"),

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
		// A typed break is a page/column break, not a soft line break. Without
		// this both come back as `md:linebreak` and a page break silently
		// degrades into a `\` at the end of a line.
		w("w:br").whereAttr("type", /^(page|column)$/).to((el, ctx) => ({
			kind: "leaf",
			tag: "md:pagebreak",
			data: { kind: ctx.attr("type", el) },
		})),
		w("w:br").emit("md:linebreak"),

		w("w:hyperlink").to((el, ctx) => {
			const id = ctx.attr("id", el);
			const href = (id && rels.get(id)) ?? ctx.attr("anchor", el) ?? "#";
			return { kind: "leaf", tag: "md:link", data: { href, text: ctx.text(el) } };
		}),

		w("w:tbl").to((el, ctx) => ({ kind: "nodes", nodes: [buildTable(el, ctx)] })),

		// An inline picture. `r:embed` points at an embedded media part,
		// `r:link` at an external file; either way the rels map has the target.
		w("w:drawing").to((el, ctx) => {
			const blip = ctx.find("blip", el);
			const id = blip && (ctx.attr("embed", blip) ?? ctx.attr("link", blip));
			const docPr = ctx.find("docPr", el);
			const alt = docPr && ctx.attr("descr", docPr);
			const data: Record<string, unknown> = { src: (id && rels.get(id)) ?? "" };
			if (alt) data.alt = alt;
			return { kind: "leaf", tag: "md:image", data };
		}),

		w("w:footnoteReference").to((el, ctx) => {
			const id = ctx.attr("id", el);
			return id ? { kind: "leaf", tag: "md:footnote", data: { id } } : { kind: "drop" };
		}),
		// Structural bits of a footnote definition: the mark the note opens with,
		// and the rules a separator note is made of.
		w(["w:footnoteRef", "w:separator", "w:continuationSeparator"]).drop(),

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
