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
	AssembleContext,
	BreakKind,
	DocumentStyles,
	EmitContext,
	Node,
	ResolvedStyle,
	WriteProfile,
	WriteResult,
} from "../../types.ts";
import type { XmlElement } from "../../xml/types.ts";
import type { PageSetup } from "../../types.ts";
import { type ResolvedPage, resolvePage } from "../page.ts";
import { out, outAny } from "../../dsl.ts";
import { append, XML_DECL } from "../../xml/build.ts";
import { serializeXml } from "../../xml/serialize.ts";
import { createResourceSink } from "../../write.ts";
import {
	embeddedImages,
	embedImage,
	type ImageResolver,
	imageSize,
	mediaParts,
	textWidth,
} from "../media.ts";
import { hasBlockChildren, wrapsSoleBlock } from "../../rules/paragraph.ts";
import { breakKind, collectHeadings, TOC_TAG, type TocData } from "../../rules/extra/mod.ts";
import { DOCX_NS, REL_NS, WML_NS } from "./styles.ts";
import {
	contentTypes,
	documentRels,
	FOOTER_REL_ID,
	type NumberingInstance,
	numberingPart,
	packageRels,
	pageNumberFooterPart,
	settingsPart,
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
const EMU_PER_POINT = 12700;
const DRAWING_IDS = "docx:drawing-ids";

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
	/**
	 * Caller-defined named styles. Every registered style is written into
	 * `word/styles.xml` as a document-wide definition, and any node bound to one
	 * references it by name rather than carrying direct formatting.
	 */
	styles?: DocumentStyles;
	/** Page size, orientation, margins and the default body font. */
	page?: PageSetup;
	/** Extra emitters, consulted before the built-ins. */
	emitters?: AnyEmitter[];
	/**
	 * Bytes for an image's `src`. An image it resolves is embedded as a
	 * `word/media/` part and sized from its pixels (capped at the text width);
	 * one it declines stays an external link at `imageExtent`.
	 */
	resolveImage?: ImageResolver;
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

/**
 * What every run builder needs: the two font knobs, plus the registry a
 * character style name resolves through. Carried as one object so adding the
 * registry did not mean threading a second argument through eight call sites.
 */
type RunOptions =
	& Required<Pick<DocxWriteOptions, "monoFont" | "highlightColor">>
	& Pick<DocxWriteOptions, "styles">;

/** `<w:rPr>` for a resolved style, or undefined when the style is empty. */
function runProperties(
	style: ResolvedStyle,
	ctx: EmitContext,
	options: RunOptions,
): XmlElement | undefined {
	const props: XmlElement[] = [];
	if (style.charStyle) {
		const id = options.styles?.idFor(style.charStyle) ?? style.charStyle;
		props.push(ctx.el("w:rStyle", { "w:val": id }));
	}
	if (style.mono) {
		props.push(ctx.el("w:rFonts", { "w:ascii": options.monoFont, "w:hAnsi": options.monoFont }));
	}
	if (style.bold) props.push(ctx.el("w:b"));
	if (style.italic) props.push(ctx.el("w:i"));
	if (style.strike) props.push(ctx.el("w:strike"));
	if (style.highlight) props.push(ctx.el("w:highlight", { "w:val": options.highlightColor }));
	if (style.underline) props.push(ctx.el("w:u", { "w:val": "single" }));
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
	options: RunOptions,
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
	/** `<w:spacing w:after>`, in twips. */
	spaceAfter?: number;
	/** `<w:pageBreakBefore/>`. Only "page" has a `<w:pPr>` spelling in docx. */
	breakBefore?: BreakKind;
}

/** Twips of space below a horizontal rule - one line at the default size. */
const HR_SPACE_AFTER = 240;

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
	if (options.spaceAfter !== undefined) {
		props.push(ctx.el("w:spacing", { "w:after": options.spaceAfter }));
	}
	if (options.align && options.align !== "l") {
		props.push(ctx.el("w:jc", { "w:val": JC[options.align] }));
	}

	const p = ctx.el("w:p");
	if (props.length > 0) append(p, ctx.el("w:pPr", {}, props));
	return p;
}

/**
 * The paragraph style the current block frame calls for.
 *
 * A caller-registered name wins over the built-in role mapping, so binding
 * `md:blockquote` to a `PullQuote` style restyles every blockquote in the
 * document without touching an emitter.
 */
function blockStyleId(style: ResolvedStyle, styles?: DocumentStyles): string | undefined {
	if (style.named !== undefined) return styles?.idFor(style.named) ?? style.named;
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
	const opts: RunOptions = {
		monoFont: options.monoFont ?? "Consolas",
		highlightColor: options.highlightColor ?? "yellow",
		styles: options.styles,
	};
	const styles = options.styles;
	const extent = options.imageExtent ?? { cx: DEFAULT_EXTENT, cy: DEFAULT_EXTENT };
	const resources = createResourceSink();
	const maxImageWidth = textWidth(resolvePage(options.page, () => {}));

	const emitters: AnyEmitter[] = [
		...(options.emitters ?? []),

		out("core:paragraph").where(wrapsSoleBlock).unwrap(),

		// ---- caller-defined styles -----------------------------------------
		...(styles
			? [
				outAny()
					.where((node) => styles.nameFor(node) !== undefined)
					.named("out:docx-styled")
					.to((node, ctx) => {
						const name = styles.nameFor(node)!;
						const block = styles.resolve(name);
						if (block.family === "text") {
							return { kind: "style", style: { charStyle: name } };
						}
						if (hasBlockChildren(node)) {
							return { kind: "style", style: { named: name } };
						}
						return {
							kind: "element",
							el: paragraph(ctx, { styleId: styles.idFor(name) }),
						};
					}),
			]
			: []),

		// ---- blocks --------------------------------------------------------

		out("md:heading").to((node, ctx) => {
			const level = Math.min(6, Math.max(1, Number(node.data.level) || 1));
			return { kind: "element", el: paragraph(ctx, { styleId: `Heading${level}` }) };
		}),

		out("core:paragraph").to((_node, ctx) => ({
			kind: "element",
			el: paragraph(ctx, {
				styleId: blockStyleId(ctx.style, options.styles),
				align: ctx.style.align,
				breakBefore: ctx.style.breakBefore,
			}),
		})),

		out("md:pagebreak").to((node, ctx) => {
			const p = paragraph(ctx);
			append(p, ctx.el("w:r", {}, [ctx.el("w:br", { "w:type": breakKind(node) })]));
			return { kind: "nodes", nodes: [p] };
		}),

		out(TOC_TAG).to((node, ctx) => ({ kind: "nodes", nodes: tableOfContents(node, ctx, opts) })),

		out("md:blockquote").style({ blockRole: "quote" }),

		out("md:lineitem").to((_node, ctx) => ({
			kind: "element",
			el: paragraph(ctx, { styleId: blockStyleId(ctx.style, options.styles) ?? "Quote" }),
		})),

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
			nodes: [paragraph(ctx, { border: true, spaceAfter: HR_SPACE_AFTER })],
		})),

		// ---- lists ---------------------------------------------------------

		out(["md:orderedlist", "md:unorderedlist"]).to((node, ctx) => {
			const kind = node.tag === "md:orderedlist" ? "ordered" : "unordered";
			const outer = ctx.style.list;
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
			const image = embedImage(
				ctx.state,
				data.src ?? "",
				options.resolveImage,
				"word/media/",
			);
			if (image) {
				// Relationship targets are relative to `word/`.
				const id = resources.ensure(image.path.slice("word/".length), "image", {
					external: false,
				});
				const size = imageSize(image, maxImageWidth);
				const embedded = size
					? {
						cx: Math.round(size.width * EMU_PER_POINT),
						cy: Math.round(size.height * EMU_PER_POINT),
					}
					: extent;
				return { kind: "nodes", nodes: [buildDrawing(ctx, id, data, embedded, "embed")] };
			}
			const id = resources.ensure(data.src ?? "", "image");
			return { kind: "nodes", nodes: [buildDrawing(ctx, id, data, extent, "link")] };
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

			const pageWarnings: string[] = [];
			const page = resolvePage(options.page, (m) => pageWarnings.push(`docx: ${m}`));
			const hasToc = ctx.state.get(HAS_TOC) === true;
			const footer = page.pageNumbers !== undefined;
			const document = ctx.el("w:document");
			const bodyEl = ctx.el("w:body", {}, body as XmlElement[]);
			append(bodyEl, sectionProperties(ctx, page));
			append(document, bodyEl);
			for (const [prefix, uri] of Object.entries(DOCX_WRITE_NS)) {
				document.attrs.set(`xmlns:${prefix}`, uri);
			}

			const images = embeddedImages(ctx.state);
			const parts: Record<string, string> = {
				"[Content_Types].xml": contentTypes({
					footnotes: notes.size > 0,
					settings: hasToc,
					footer: footer,
					media: images,
				}),
				"_rels/.rels": packageRels(),
				"word/document.xml": ctx.serialize(document),
				"word/_rels/document.xml.rels": documentRels(resources.entries, notes.size > 0, {
					settings: hasToc,
					footer,
				}),
				"word/styles.xml": stylesPart({ monoFont: opts.monoFont, styles, font: page.font }),
				"word/numbering.xml": numberingPart(nums),
			};
			if (notes.size > 0) parts["word/footnotes.xml"] = footnotesPart(notes);
			if (hasToc) parts["word/settings.xml"] = settingsPart({ updateFields: true });
			if (page.pageNumbers) parts["word/footer1.xml"] = pageNumberFooterPart(page.pageNumbers);

			return {
				parts,
				primary: "word/document.xml",
				extension: "docx",
				mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				...(images.length ? { media: mediaParts(images) } : {}),
				warnings: [...ctx.warnings, ...pageWarnings],
			} satisfies WriteResult;
		},
	};
}

// ---- builders -------------------------------------------------------------

const HAS_TOC = "docx:toc";

/** A field-code run: `<w:fldChar>` of the given type. */
function fieldChar(ctx: EmitContext, type: "begin" | "separate" | "end"): XmlElement {
	return ctx.el("w:r", {}, [
		ctx.el(
			"w:fldChar",
			type === "begin" ? { "w:fldCharType": type, "w:dirty": "true" } : {
				"w:fldCharType": type,
			},
		),
	]);
}

/**
 * A `TOC` field over the document's headings.
 *
 * The field's cached result is filled with the entries (without page numbers -
 * clawmark does not lay out pages), so the contents read correctly in a
 * reader that never updates fields. Word updates it on open: the field is
 * marked dirty and `settings.xml` asks for it.
 */
function tableOfContents(node: Node, ctx: EmitContext, opts: RunOptions): XmlElement[] {
	ctx.state.set(HAS_TOC, true);
	const data = node.data as TocData;
	const levels = Math.min(Math.max(data.levels ?? 3, 1), 9);
	const entries = collectHeadings(ctx.ancestors[0] ?? node, data);
	const nodes: XmlElement[] = [];

	if (data.title) {
		const title = paragraph(ctx, { styleId: "TOCHeading" });
		append(title, textRun(data.title, ctx, opts, {}));
		nodes.push(title);
	}

	const begin = [
		fieldChar(ctx, "begin"),
		ctx.el("w:r", {}, [
			ctx.el("w:instrText", { "xml:space": "preserve" }, [
				ctx.txt(` TOC \\o "1-${levels}" \\h \\z \\u `),
			]),
		]),
		fieldChar(ctx, "separate"),
	];

	if (entries.length === 0) {
		const p = paragraph(ctx);
		append(p, ...begin, textRun("No headings yet.", ctx, opts, {}), fieldChar(ctx, "end"));
		return [...nodes, p];
	}

	entries.forEach((entry, i) => {
		const p = paragraph(ctx, { styleId: `TOC${Math.min(entry.level, 6)}` });
		if (i === 0) append(p, ...begin);
		append(p, textRun(entry.text, ctx, opts, {}));
		if (i === entries.length - 1) append(p, fieldChar(ctx, "end"));
		nodes.push(p);
	});
	return nodes;
}

const twips = (points: number) => Math.round(points * 20);

/**
 * `<w:sectPr>`: page size, then margins - a schema sequence, so in that order.
 * `w:header`/`w:footer`/`w:gutter` are required attributes of `w:pgMar`; Word's
 * own defaults (half an inch, none) fill them.
 */
function sectionProperties(ctx: AssembleContext, page: ResolvedPage): XmlElement {
	const children: XmlElement[] = [];
	if (page.pageNumbers) {
		children.push(ctx.el("w:footerReference", { "w:type": "default", "r:id": FOOTER_REL_ID }));
	}
	if (page.size) {
		const attrs: Record<string, string | number> = {
			"w:w": twips(page.size.width),
			"w:h": twips(page.size.height),
		};
		if (page.size.landscape) attrs["w:orient"] = "landscape";
		children.push(ctx.el("w:pgSz", attrs));
	}
	if (page.margins) {
		const inch = 1440;
		const m = page.margins;
		children.push(ctx.el("w:pgMar", {
			"w:top": m.top === undefined ? inch : twips(m.top),
			"w:right": m.right === undefined ? inch : twips(m.right),
			"w:bottom": m.bottom === undefined ? inch : twips(m.bottom),
			"w:left": m.left === undefined ? inch : twips(m.left),
			"w:header": 720,
			"w:footer": 720,
			"w:gutter": 0,
		}));
	}
	return ctx.el("w:sectPr", {}, children);
}

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
	opts: RunOptions,
): void {
	const list = ctx.style.list;
	const p = paragraph(ctx, {
		styleId: "ListParagraph",
		numPr: list?.id ? { numId: list.id, level: list.level } : undefined,
	});
	append(parent, p);

	if (node.tag === "md:checkitem") {
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
	opts: RunOptions,
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
 * An inline `<w:drawing>`. `"embed"` references a media part in the package
 * (`r:embed`); `"link"` an external file (`r:link`), for an image no resolver
 * supplied - then clawmark has never seen the file, so `<wp:extent>` is the
 * fallback size and Word scales to it.
 */
function buildDrawing(
	ctx: EmitContext,
	relId: string,
	data: { src?: string; alt?: string },
	extent: { cx: number; cy: number },
	mode: "embed" | "link",
): XmlElement {
	const name = (data.src ?? "image").split("/").pop() || "image";
	// Word rejects a document whose drawings share a `docPr` id.
	const drawingId = (ctx.state.get(DRAWING_IDS) as number | undefined ?? 0) + 1;
	ctx.state.set(DRAWING_IDS, drawingId);
	const pic = ctx.el("pic:pic", {}, [
		ctx.el("pic:nvPicPr", {}, [
			ctx.el("pic:cNvPr", { id: drawingId, name, descr: data.alt }),
			ctx.el("pic:cNvPicPr"),
		]),
		ctx.el("pic:blipFill", {}, [
			ctx.el("a:blip", { [mode === "embed" ? "r:embed" : "r:link"]: relId }),
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
				ctx.el("wp:docPr", { id: drawingId, name, descr: data.alt }),
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
