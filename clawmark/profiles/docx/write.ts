/**
 * @module
 * The docx (WordprocessingML) write profile - the inverse of `docxProfile()`.
 *
 * ```ts
 * const out = markdownWith("# Hello", docxWriter());
 * out.parts["word/document.xml"];
 * ```
 *
 * **Same scope boundary as the reader: this does not produce a `.docx`.** It
 * produces the parts one is made of, as strings, and the caller zips them.
 *
 * Two structural facts about WordprocessingML drive nearly every decision here,
 * and both are why the write direction needed a style-frame stack at all:
 *
 * - **Nothing nests.** A blockquote is not an element, it is a run of `<w:p>`
 *   carrying the Quote style; a list is a run of `<w:p>` carrying `<w:numPr>`.
 *   So the container tags contribute style frames and emit no element, and the
 *   emitter that does produce a `<w:p>` reads the accumulated role off
 *   `ctx.style`.
 * - **A run carries all its formatting at once.** `<w:b/>` and `<w:i/>` are
 *   siblings inside one `<w:rPr>`, where the tree has `md:bold > md:italic`.
 *   Same mechanism: the emphasis tags are frames, `core:text` builds the run.
 */

import type {
	AnyEmitter,
	BreakKind,
	EmitContext,
	Node,
	ResolvedStyle,
	WriteProfile,
	WriteResult,
} from "../../types.ts";
import type { XmlElement } from "../../xml/types.ts";
import { out } from "../../dsl.ts";
import { append, XML_DECL } from "../../xml/build.ts";
import { serializeXml } from "../../xml/serialize.ts";
import { createResourceSink } from "../../write.ts";
import { wrapsSoleBlock } from "../../rules/paragraph.ts";
import { breakKind } from "../../rules/extra/mod.ts";
import { DOCX_NS, REL_NS, WML_NS } from "./styles.ts";
import {
	contentTypes,
	documentRels,
	type NumberingInstance,
	numberingPart,
	packageRels,
	stylesPart,
} from "./parts.ts";

export const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
export const DML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const PIC_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture";

/** Namespaces declared on `<w:document>`. */
export const DOCX_WRITE_NS: Record<string, string> = {
	...DOCX_NS,
	wp: DRAWING_NS,
	a: DML_NS,
	pic: PIC_NS,
};

const LIST_TAGS = new Set(["md:orderedlist", "md:unorderedlist"]);

/** One EMU-inch. Used for both dimensions of an image with no known size. */
const DEFAULT_EXTENT = 914400;

export interface DocxWriteOptions {
	/** Font referenced for code spans and code blocks. Default "Consolas". */
	monoFont?: string;
	/** `<w:highlight w:val>` for `==highlight==`. Default "yellow". */
	highlightColor?: string;
	/**
	 * Fallback size, in EMU, for an image. A markdown image carries no
	 * dimensions and clawmark never opens the file to find them, so every
	 * `<wp:extent>` gets this. Default 914400 (one inch) square.
	 */
	imageExtent?: { cx: number; cy: number };
	/** Extra emitters, consulted before the built-ins. */
	emitters?: AnyEmitter[];
}

// ---- per-document state ---------------------------------------------------

interface FootnoteEntry {
	docxId: number;
	body: XmlElement[];
}

const NUMS = "docx:nums";
const FOOTNOTES = "docx:footnotes";

function numbering(ctx: EmitContext): NumberingInstance[] {
	let list = ctx.state.get(NUMS) as NumberingInstance[] | undefined;
	if (!list) {
		list = [];
		ctx.state.set(NUMS, list);
	}
	return list;
}

function footnotes(ctx: EmitContext): Map<string, FootnoteEntry> {
	let map = ctx.state.get(FOOTNOTES) as Map<string, FootnoteEntry> | undefined;
	if (!map) {
		map = new Map();
		ctx.state.set(FOOTNOTES, map);
	}
	return map;
}

/**
 * Resolves a markdown footnote label to the integer docx insists on.
 *
 * A numeric label is kept as-is so `[^1]` survives a round trip untouched.
 * Anything else - markdown allows `[^note]` - has to be renumbered, and the
 * label is lost. Ids 0 and -1 are reserved for the separator footnotes.
 */
function footnoteId(ctx: EmitContext, label: string): number {
	const map = footnotes(ctx);
	const hit = map.get(label);
	if (hit) return hit.docxId;

	const numeric = /^\d+$/.test(label) ? Number(label) : 0;
	const taken = new Set([...map.values()].map((entry) => entry.docxId));
	let id = numeric >= 1 && !taken.has(numeric) ? numeric : 1;
	while (taken.has(id)) id++;
	if (numeric < 1) {
		ctx.warn(`docx: footnote label "${label}" is not numeric and was renumbered to ${id}`);
	}

	map.set(label, { docxId: id, body: [] });
	return id;
}

// ---- element helpers ------------------------------------------------------

/** `<w:rPr>` for a resolved style, or undefined when the style is empty. */
function runProperties(
	style: ResolvedStyle,
	ctx: EmitContext,
	options: Required<Pick<DocxWriteOptions, "monoFont" | "highlightColor">>,
): XmlElement | undefined {
	const props: XmlElement[] = [];
	if (style.bold) props.push(ctx.el("w:b"));
	if (style.italic) props.push(ctx.el("w:i"));
	if (style.strike) props.push(ctx.el("w:strike"));
	if (style.underline) props.push(ctx.el("w:u", { "w:val": "single" }));
	if (style.highlight) props.push(ctx.el("w:highlight", { "w:val": options.highlightColor }));
	if (style.mono) {
		props.push(ctx.el("w:rFonts", { "w:ascii": options.monoFont, "w:hAnsi": options.monoFont }));
	}
	return props.length === 0 ? undefined : ctx.el("w:rPr", {}, props);
}

/**
 * `<w:t xml:space="preserve">` always, never a bare `<w:t>`.
 *
 * Without the attribute the reader routes the text through the crawler's
 * whitespace collapsing, which eats the space in `plain **bold** text` at both
 * seams. With it, the reader takes the value verbatim and inline spacing
 * survives the round trip exactly.
 */
function textRun(
	value: string,
	ctx: EmitContext,
	options: Required<Pick<DocxWriteOptions, "monoFont" | "highlightColor">>,
	style: ResolvedStyle = ctx.style,
	preserve = true,
): XmlElement {
	const children: XmlElement[] = [];
	const props = runProperties(style, ctx, options);
	if (props) children.push(props);
	children.push(ctx.el("w:t", preserve ? { "xml:space": "preserve" } : {}, [ctx.txt(value)]));
	return ctx.el("w:r", {}, children);
}

interface ParagraphOptions {
	styleId?: string;
	numPr?: { numId: string; level: number };
	align?: ResolvedStyle["align"];
	border?: boolean;
	/** `<w:pageBreakBefore/>`. Only "page" has a `<w:pPr>` spelling in docx. */
	breakBefore?: BreakKind;
}

/** Word spells justified alignment `both`, not `justify`. */
const JC: Record<NonNullable<ResolvedStyle["align"]>, string> = {
	l: "left",
	c: "center",
	r: "right",
	j: "both",
};

/**
 * A `<w:p>` with its `<w:pPr>` already in place.
 *
 * The returned element is used as its own `into`: `<w:pPr>` is appended first,
 * so content emitted afterwards lands after it, which is the order the schema
 * requires.
 */
function paragraph(ctx: EmitContext, options: ParagraphOptions = {}): XmlElement {
	// `<w:pPr>` is a schema *sequence*, not a bag: pStyle, pageBreakBefore,
	// numPr, pBdr, jc is the order CT_PPrBase declares, and Word rejects a
	// document that scrambles it.
	const props: XmlElement[] = [];
	if (options.styleId) props.push(ctx.el("w:pStyle", { "w:val": options.styleId }));
	if (options.breakBefore === "page") props.push(ctx.el("w:pageBreakBefore"));
	if (options.numPr) {
		props.push(ctx.el("w:numPr", {}, [
			ctx.el("w:ilvl", { "w:val": options.numPr.level }),
			ctx.el("w:numId", { "w:val": options.numPr.numId }),
		]));
	}
	if (options.border) {
		props.push(ctx.el("w:pBdr", {}, [
			ctx.el("w:bottom", { "w:val": "single", "w:sz": 6, "w:space": 1, "w:color": "auto" }),
		]));
	}
	if (options.align && options.align !== "l") {
		props.push(ctx.el("w:jc", { "w:val": JC[options.align] }));
	}

	const p = ctx.el("w:p");
	if (props.length > 0) append(p, ctx.el("w:pPr", {}, props));
	return p;
}

/** The paragraph style the current block frame calls for. */
function blockStyleId(style: ResolvedStyle): string | undefined {
	switch (style.blockRole) {
		case "quote":
			return "Quote";
		case "code":
			return "SourceCode";
		case "list":
			return "ListParagraph";
		default:
			return undefined;
	}
}

// ---- the profile ----------------------------------------------------------

/** A write profile that turns a clawmark tree into WordprocessingML. */
export function docxWriter(options: DocxWriteOptions = {}): WriteProfile {
	const opts = {
		monoFont: options.monoFont ?? "Consolas",
		highlightColor: options.highlightColor ?? "yellow",
	};
	const extent = options.imageExtent ?? { cx: DEFAULT_EXTENT, cy: DEFAULT_EXTENT };
	const resources = createResourceSink();

	const emitters: AnyEmitter[] = [
		...(options.emitters ?? []),

		// The lexer opens a paragraph around every block, so a heading arrives as
		// `core:paragraph > md:heading`. Without this the whole document would be
		// double-wrapped.
		out("core:paragraph").where(wrapsSoleBlock).unwrap(),

		// ---- blocks --------------------------------------------------------

		out("md:heading").to((node, ctx) => {
			const level = Math.min(6, Math.max(1, Number(node.data.level) || 1));
			return { kind: "element", el: paragraph(ctx, { styleId: `Heading${level}` }) };
		}),

		out("core:paragraph").to((_node, ctx) => ({
			kind: "element",
			el: paragraph(ctx, {
				styleId: blockStyleId(ctx.style),
				align: ctx.style.align,
				breakBefore: ctx.style.breakBefore,
			}),
		})),

		// Unlike ODF, docx has a real element for this - a break run in a
		// paragraph of its own. `w:type="column"` covers the other kind, which
		// `<w:pageBreakBefore/>` cannot express at all.
		out("md:pagebreak").to((node, ctx) => {
			const p = paragraph(ctx);
			append(p, ctx.el("w:r", {}, [ctx.el("w:br", { "w:type": breakKind(node) })]));
			return { kind: "nodes", nodes: [p] };
		}),

		out("md:blockquote").style({ blockRole: "quote" }),
		// Each line of a blockquote is a paragraph of its own; the Quote style
		// comes from the frame the blockquote pushed.
		out("md:lineitem").to((_node, ctx) => ({
			kind: "element",
			el: paragraph(ctx, { styleId: blockStyleId(ctx.style) ?? "Quote" }),
		})),

		// `<w:t>` cannot hold a newline, so a code block is one paragraph per
		// line. `docxProfile` merges the run back into a single node - see
		// `buildCodeBlock` there.
		out("md:codeblock").to((node, ctx) => {
			const value = String((node.data as { value?: string }).value ?? "");
			const nodes = value.split("\n").map((line) => {
				const p = paragraph(ctx, { styleId: "SourceCode" });
				if (line !== "") append(p, textRun(line, ctx, opts, { mono: true }));
				return p;
			});
			return { kind: "nodes", nodes };
		}),

		out("md:hr").to((_node, ctx) => ({
			kind: "nodes",
			nodes: [paragraph(ctx, { border: true })],
		})),

		// ---- lists ---------------------------------------------------------

		out(["md:orderedlist", "md:unorderedlist"]).to((node, ctx) => {
			const kind = node.tag === "md:orderedlist" ? "ordered" : "unordered";
			const outer = ctx.style.list;
			// A nested list of the *same* kind continues its parent's numbering at
			// a deeper level; a different kind needs its own definition, because
			// one `w:num` resolves every level through a single abstract
			// definition and would render an ordered sublist as bullets.
			const reuse = outer !== undefined && outer.kind === kind;
			const numId = reuse ? outer.id! : mintNum(ctx, kind);
			return {
				kind: "style",
				style: {
					blockRole: "list",
					list: { kind, level: outer === undefined ? 0 : outer.level + 1, id: numId },
				},
			};
		}),

		out(["md:listitem", "md:checkitem"]).to((node, ctx) => ({
			kind: "custom",
			run: (parent) => emitListItem(node, parent, ctx, opts),
		})),

		// ---- tables --------------------------------------------------------

		out("md:table").to((node, ctx) => ({ kind: "nodes", nodes: [buildTable(node, ctx, opts)] })),
		out(["md:tablerow", "md:tableformat"]).drop(),

		// ---- footnotes -----------------------------------------------------

		out("md:footnote").to((node, ctx) => {
			const id = footnoteId(ctx, String((node.data as { id?: string }).id ?? ""));
			return {
				kind: "nodes",
				nodes: [ctx.el("w:r", {}, [
					ctx.el("w:rPr", {}, [ctx.el("w:rStyle", { "w:val": "FootnoteReference" })]),
					ctx.el("w:footnoteReference", { "w:id": id }),
				])],
			};
		}),

		// The definition contributes nothing to the body - it is emitted into a
		// detached paragraph and stashed for `word/footnotes.xml`.
		out("md:footnotedef").to((node, ctx) => ({
			kind: "custom",
			run: () => {
				const label = String((node.data as { id?: string }).id ?? "");
				const id = footnoteId(ctx, label);
				const p = paragraph(ctx);
				append(
					p,
					ctx.el("w:r", {}, [
						ctx.el("w:rPr", {}, [ctx.el("w:rStyle", { "w:val": "FootnoteReference" })]),
						ctx.el("w:footnoteRef"),
					]),
				);
				// Deliberately *not* `xml:space="preserve"`: Word wants a space
				// after the mark, but the reader must collapse it away at block
				// start or every definition comes back with a leading blank.
				append(p, textRun(" ", ctx, opts, {}, false));
				ctx.children(p);
				footnotes(ctx).set(label, { docxId: id, body: [p] });
			},
		})),

		// ---- inline --------------------------------------------------------

		out("md:bold").style({ bold: true }),
		out("md:italic").style({ italic: true }),
		out("md:bolditalic").style({ bold: true, italic: true }),
		out("md:strikethrough").style({ strike: true }),
		out("md:underline").style({ underline: true }),
		out("md:highlight").style({ highlight: true }),

		out("md:code").to((node, ctx) => ({
			kind: "nodes",
			nodes: [
				textRun(String((node.data as { value?: string }).value ?? ""), ctx, opts, {
					...ctx.style,
					mono: true,
				}),
			],
		})),

		out("md:link").to((node, ctx) => {
			const data = node.data as { href?: string; text?: string };
			const id = resources.ensure(data.href ?? "#", "hyperlink");
			const style: ResolvedStyle = { ...ctx.style, underline: true };
			const run = textRun(data.text ?? "", ctx, opts, style);
			return { kind: "nodes", nodes: [ctx.el("w:hyperlink", { "r:id": id }, [run])] };
		}),

		out("md:image").to((node, ctx) => {
			const data = node.data as { src?: string; alt?: string };
			const id = resources.ensure(data.src ?? "", "image");
			return { kind: "nodes", nodes: [buildDrawing(ctx, id, data, extent)] };
		}),

		out("md:linebreak").to((_node, ctx) => ({
			kind: "nodes",
			nodes: [ctx.el("w:r", {}, [ctx.el("w:br")])],
		})),

		out("md:raw").to((node, ctx) => ({
			kind: "nodes",
			nodes: [textRun(String((node.data as { value?: string }).value ?? ""), ctx, opts)],
		})),

		out("core:text").to((node, ctx) => {
			const value = String((node.data as { value?: string }).value ?? "");
			if (value === "") return { kind: "drop" };
			return { kind: "nodes", nodes: [textRun(value, ctx, opts)] };
		}),
	];

	return {
		name: "docx",
		nsMap: DOCX_WRITE_NS,
		resources,
		emitters,
		assemble(body, ctx) {
			const notes = (ctx.state.get(FOOTNOTES) as Map<string, FootnoteEntry> | undefined) ??
				new Map();
			const nums = (ctx.state.get(NUMS) as NumberingInstance[] | undefined) ?? [];

			const document = ctx.el("w:document");
			const bodyEl = ctx.el("w:body", {}, body as XmlElement[]);
			// A section marker closes a valid body; Word inserts a default one
			// anyway, but writing it makes the part self-describing.
			append(bodyEl, ctx.el("w:sectPr"));
			append(document, bodyEl);
			for (const [prefix, uri] of Object.entries(DOCX_WRITE_NS)) {
				document.attrs.set(`xmlns:${prefix}`, uri);
			}

			const parts: Record<string, string> = {
				"[Content_Types].xml": contentTypes({ footnotes: notes.size > 0 }),
				"_rels/.rels": packageRels(),
				"word/document.xml": ctx.serialize(document),
				"word/_rels/document.xml.rels": documentRels(resources.entries, notes.size > 0),
				"word/styles.xml": stylesPart(opts.monoFont),
				"word/numbering.xml": numberingPart(nums),
			};
			if (notes.size > 0) parts["word/footnotes.xml"] = footnotesPart(notes);

			return {
				parts,
				primary: "word/document.xml",
				extension: "docx",
				mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				warnings: [...ctx.warnings],
			} satisfies WriteResult;
		},
	};
}

// ---- builders -------------------------------------------------------------

function mintNum(ctx: EmitContext, kind: "ordered" | "unordered"): string {
	const list = numbering(ctx);
	const numId = String(list.length + 1);
	list.push({ numId, kind });
	return numId;
}

const CHECK_GLYPH = { on: "☒ ", off: "☐ " };

/**
 * A list item is a `<w:p>`, and a *nested* list under it is a run of further
 * `<w:p>` siblings - not children. So the item's inline content goes into its
 * own paragraph while its block children go to the item's parent, which is the
 * one shape `wrap`/`chain` cannot express.
 */
function emitListItem(
	node: Node,
	parent: XmlElement,
	ctx: EmitContext,
	opts: Required<Pick<DocxWriteOptions, "monoFont" | "highlightColor">>,
): void {
	const list = ctx.style.list;
	const p = paragraph(ctx, {
		styleId: "ListParagraph",
		numPr: list?.id ? { numId: list.id, level: list.level } : undefined,
	});
	append(parent, p);

	if (node.tag === "md:checkitem") {
		// docx has no checkbox a paragraph can carry, so the state becomes a
		// glyph. It reads back as literal text, not as a check item.
		const checked = (node.data as { checked?: boolean }).checked === true;
		append(p, textRun(checked ? CHECK_GLYPH.on : CHECK_GLYPH.off, ctx, opts));
	}

	for (const child of node.children) {
		ctx.child(LIST_TAGS.has(child.tag) ? parent : p, child);
	}
}

const BORDER = { "w:val": "single", "w:sz": 4, "w:space": 0, "w:color": "auto" };

function buildTable(
	node: Node,
	ctx: EmitContext,
	opts: Required<Pick<DocxWriteOptions, "monoFont" | "highlightColor">>,
): XmlElement {
	const rows = node.children.filter((child) => child.tag === "md:tablerow");
	const format = node.children.find((child) => child.tag === "md:tableformat");
	const align = (format?.data as { columns?: ("l" | "c" | "r")[] })?.columns ?? [];
	const columns = Math.max(
		1,
		Number((node.data as { columns?: number }).columns) || 0,
		...rows.map((row) => ((row.data as { columns?: string[] }).columns ?? []).length),
	);

	const borders = ctx.el(
		"w:tblBorders",
		{},
		["w:top", "w:left", "w:bottom", "w:right", "w:insideH", "w:insideV"].map((side) =>
			ctx.el(side, BORDER)
		),
	);
	const table = ctx.el("w:tbl", {}, [
		ctx.el("w:tblPr", {}, [ctx.el("w:tblW", { "w:w": 0, "w:type": "auto" }), borders]),
		ctx.el(
			"w:tblGrid",
			{},
			Array.from({ length: columns }, () => ctx.el("w:gridCol")),
		),
	]);

	rows.forEach((row, index) => {
		const cells = (row.data as { columns?: string[] }).columns ?? [];
		const tr = ctx.el("w:tr");
		// The header row is marked so it repeats across a page break, which is
		// what a markdown header row means as closely as docx can say it.
		if (index === 0) append(tr, ctx.el("w:trPr", {}, [ctx.el("w:tblHeader")]));
		for (let column = 0; column < columns; column++) {
			const p = paragraph(ctx, { align: align[column] });
			append(p, textRun(cells[column] ?? "", ctx, opts, index === 0 ? { bold: true } : {}));
			append(
				tr,
				ctx.el("w:tc", {}, [
					ctx.el("w:tcPr", {}, [ctx.el("w:tcW", { "w:w": 0, "w:type": "auto" })]),
					p,
				]),
			);
		}
		append(table, tr);
	});

	return table;
}

/**
 * An inline `<w:drawing>` referencing the image as an *external* relationship.
 *
 * clawmark never opens the file, so there is no media part to embed and no way
 * to know the real dimensions - `<wp:extent>` gets `imageExtent` and Word
 * scales to it. That is the honest limit of writing an image without reading
 * one.
 */
function buildDrawing(
	ctx: EmitContext,
	relId: string,
	data: { src?: string; alt?: string },
	extent: { cx: number; cy: number },
): XmlElement {
	const name = (data.src ?? "image").split("/").pop() || "image";
	const pic = ctx.el("pic:pic", {}, [
		ctx.el("pic:nvPicPr", {}, [
			ctx.el("pic:cNvPr", { id: 1, name, descr: data.alt }),
			ctx.el("pic:cNvPicPr"),
		]),
		ctx.el("pic:blipFill", {}, [
			ctx.el("a:blip", { "r:link": relId }),
			ctx.el("a:stretch", {}, [ctx.el("a:fillRect")]),
		]),
		ctx.el("pic:spPr", {}, [
			ctx.el("a:xfrm", {}, [
				ctx.el("a:off", { x: 0, y: 0 }),
				ctx.el("a:ext", { cx: extent.cx, cy: extent.cy }),
			]),
			ctx.el("a:prstGeom", { prst: "rect" }, [ctx.el("a:avLst")]),
		]),
	]);

	return ctx.el("w:r", {}, [
		ctx.el("w:drawing", {}, [
			ctx.el("wp:inline", { distT: 0, distB: 0, distL: 0, distR: 0 }, [
				ctx.el("wp:extent", { cx: extent.cx, cy: extent.cy }),
				ctx.el("wp:docPr", { id: 1, name, descr: data.alt }),
				ctx.el("a:graphic", {}, [
					ctx.el("a:graphicData", {
						uri: "http://schemas.openxmlformats.org/drawingml/2006/picture",
					}, [pic]),
				]),
			]),
		]),
	]);
}

/**
 * `word/footnotes.xml`.
 *
 * Ids -1 and 0 are the separator and continuation-separator notes every
 * consumer expects to find; real notes take the ids `footnoteId` handed out.
 */
function footnotesPart(notes: Map<string, FootnoteEntry>): string {
	const separators = [
		`\t<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>`,
		`\t<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`,
	];
	const body = [...notes.values()]
		.sort((a, b) => a.docxId - b.docxId)
		.map((entry) =>
			`\t<w:footnote w:id="${entry.docxId}">${
				entry.body.map((el) => serializeXml(el)).join("")
			}</w:footnote>`
		);
	return `${XML_DECL}<w:footnotes xmlns:w="${WML_NS}" xmlns:r="${REL_NS}">
${[...separators, ...body].join("\n")}
</w:footnotes>
`;
}
