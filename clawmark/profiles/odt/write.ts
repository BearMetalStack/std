/**
 * @module
 * The odt (OpenDocument text) write profile - the inverse of `odtProfile()`.
 *
 * ```ts
 * const out = markdownWith("# Hello", odtWriter());
 * out.parts["content.xml"];
 * ```
 *
 * **Same scope boundary as the reader: this does not produce an `.odt`.** It
 * produces the parts one is made of. Note that the `mimetype` entry is not
 * XML and not optional - a conformant package stores it **first and
 * uncompressed**, which is a property of the archive, not of the bytes, so it
 * is the one thing here the caller has to get right on their own:
 *
 * ```sh
 * zip -X -0 out.odt mimetype && zip -X -r out.odt . -x mimetype
 * ```
 *
 * Where docx flattens everything, ODF nests almost properly - lists, list
 * items and headings are real elements. The exceptions are blockquotes and
 * code blocks, which are still runs of styled paragraphs, and inline
 * formatting, which is a `<text:span>` pointing at a generated *automatic
 * style* rather than properties written in place. That last one is why the
 * write direction needed a `StyleSink`: two identically bold spans must share
 * one definition, or the file grows one `<style:style>` per run.
 */

import type {
	AnyEmitter,
	EmitContext,
	EmitResult,
	Node,
	ResolvedStyle,
	StyleDef,
	WriteProfile,
	WriteResult,
} from "../../types.ts";
import type { XmlElement } from "../../xml/types.ts";
import { out } from "../../dsl.ts";
import { append } from "../../xml/build.ts";
import { createStyleSink } from "../../style.ts";
import { serializeXml } from "../../xml/serialize.ts";
import { wrapsSoleBlock } from "../../rules/paragraph.ts";
import {
	listStyle,
	manifest,
	meta,
	MIMETYPE,
	nsAttrs,
	ODF_VERSION,
	ODT_WRITE_NS,
	stylesPart,
	textStyle,
} from "./parts.ts";

const LIST_TAGS = new Set(["md:orderedlist", "md:unorderedlist"]);

const NOTES = "odt:notes";

export interface OdtWriteOptions {
	/** Font referenced for code spans and blocks. Default "Liberation Mono". */
	monoFont?: string;
	/** `<meta:generator>` value. Default "clawmark". */
	generator?: string;
	/** Extra emitters, consulted before the built-ins. */
	emitters?: AnyEmitter[];
}

/**
 * A markdown footnote is a reference here and a definition somewhere later; an
 * ODF one is a single `<text:note>` holding both. The reference emitter builds
 * the note with an empty body and parks it here, and the definition emitter
 * fills that body in when the walk reaches it.
 */
function notes(ctx: EmitContext): Map<string, XmlElement> {
	let map = ctx.state.get(NOTES) as Map<string, XmlElement> | undefined;
	if (!map) {
		map = new Map();
		ctx.state.set(NOTES, map);
	}
	return map;
}

/** The common style name a block frame calls for. */
function paragraphStyle(style: ResolvedStyle): string {
	switch (style.blockRole) {
		case "quote":
			return "Quote";
		case "code":
			return "Preformatted_20_Text";
		default:
			return "Standard";
	}
}

/** Character-level properties only - what an automatic text style may carry. */
function charStyle(style: ResolvedStyle): ResolvedStyle {
	const out: ResolvedStyle = {};
	if (style.bold) out.bold = true;
	if (style.italic) out.italic = true;
	if (style.strike) out.strike = true;
	if (style.underline) out.underline = true;
	if (style.highlight) out.highlight = true;
	if (style.mono) out.mono = true;
	return out;
}

function isEmptyStyle(style: ResolvedStyle): boolean {
	return Object.keys(style).length === 0;
}

/**
 * Text, wrapped in a `<text:span>` only when the accumulated style has
 * something to say. An unstyled run must stay bare - a span pointing at an
 * empty automatic style would read back as an extra, meaningless nesting
 * level.
 */
function styledText(
	value: string,
	ctx: EmitContext,
	style: ResolvedStyle = ctx.style,
): XmlElement[] {
	const character = charStyle(style);
	if (isEmptyStyle(character)) return [];
	const name = ctx.styles.ensure(character, "text");
	return [ctx.el("text:span", { "text:style-name": name }, [ctx.txt(value)])];
}

/**
 * A `<text:span>` for one formatting, with the node's children emitted into it.
 *
 * A formatting element with nothing inside it means nothing in any format, so
 * an empty one is dropped rather than written - which also keeps the automatic
 * style it would have interned out of the file.
 */
function span(node: Node, ctx: EmitContext, style: ResolvedStyle): EmitResult {
	if (node.children.length === 0) return { kind: "drop" };
	return {
		kind: "element",
		el: ctx.el("text:span", { "text:style-name": ctx.styles.ensure(style, "text") }),
	};
}

/** A write profile that turns a clawmark tree into OpenDocument text. */
export function odtWriter(options: OdtWriteOptions = {}): WriteProfile {
	const monoFont = options.monoFont ?? "Liberation Mono";
	const generator = options.generator ?? "clawmark";
	const styles = createStyleSink({ prefix: { text: "T", list: "L" } });

	/** A `<text:list>`'s style name, one per kind, deduped through the sink. */
	const listStyleName = (ctx: EmitContext, kind: "ordered" | "unordered") =>
		ctx.styles.ensure({ list: { kind, level: 0 } }, "list");

	const emitters: AnyEmitter[] = [
		...(options.emitters ?? []),

		// The lexer opens a paragraph around every block construct; without this
		// every heading and list would sit inside a `<text:p>`.
		out("core:paragraph").where(wrapsSoleBlock).unwrap(),

		// ---- blocks --------------------------------------------------------

		out("md:heading").to((node, ctx) => {
			const level = Math.min(6, Math.max(1, Number(node.data.level) || 1));
			return {
				kind: "element",
				el: ctx.el("text:h", {
					"text:style-name": `Heading_20_${level}`,
					"text:outline-level": level,
				}),
			};
		}),

		// A paragraph inside a list item is the item's content, not a block of
		// its own - the item emitter has already opened the `<text:p>`.
		out("core:paragraph").whereParent("md:listitem").unwrap(),
		out("core:paragraph").whereParent("md:checkitem").unwrap(),
		out("core:paragraph").to((_node, ctx) => ({
			kind: "element",
			el: ctx.el("text:p", { "text:style-name": paragraphStyle(ctx.style) }),
		})),

		out("md:blockquote").style({ blockRole: "quote" }),
		out("md:lineitem").to((_node, ctx) => ({
			kind: "element",
			el: ctx.el("text:p", { "text:style-name": "Quote" }),
		})),

		// ODF has no multi-line paragraph either: a code block is one
		// `<text:p>` per line, which `odtProfile` merges back.
		out("md:codeblock").to((node, ctx) => {
			const value = String((node.data as { value?: string }).value ?? "");
			const nodes = value.split("\n").map((line) => {
				const p = ctx.el("text:p", { "text:style-name": "Preformatted_20_Text" });
				if (line !== "") append(p, ctx.txt(line));
				return p;
			});
			return { kind: "nodes", nodes };
		}),

		out("md:hr").to((_node, ctx) => ({
			kind: "nodes",
			nodes: [ctx.el("text:p", { "text:style-name": "Horizontal_20_Line" })],
		})),

		// ---- lists ---------------------------------------------------------

		out(["md:orderedlist", "md:unorderedlist"]).to((node, ctx) => {
			const kind = node.tag === "md:orderedlist" ? "ordered" : "unordered";
			return {
				kind: "element",
				el: ctx.el("text:list", { "text:style-name": listStyleName(ctx, kind) }),
			};
		}),

		out(["md:listitem", "md:checkitem"]).to((node, ctx) => ({
			kind: "custom",
			run: (parent) => emitListItem(node, parent, ctx),
		})),

		// ---- tables --------------------------------------------------------

		out("md:table").to((node, ctx) => ({ kind: "nodes", nodes: [buildTable(node, ctx)] })),
		out(["md:tablerow", "md:tableformat"]).drop(),

		// ---- footnotes -----------------------------------------------------

		out("md:footnote").to((node, ctx) => {
			const label = String((node.data as { id?: string }).id ?? "");
			const body = ctx.el("text:note-body");
			const note = ctx.el("text:note", {
				"text:id": `ftn${label}`,
				"text:note-class": "footnote",
			}, [
				ctx.el("text:note-citation", {}, [ctx.txt(label)]),
				body,
			]);
			notes(ctx).set(label, body);
			return { kind: "nodes", nodes: [note] };
		}),

		out("md:footnotedef").to((node, ctx) => ({
			kind: "custom",
			run: () => {
				const label = String((node.data as { id?: string }).id ?? "");
				const body = notes(ctx).get(label);
				if (!body) {
					ctx.warn(`odt: footnote definition [^${label}] has no reference; dropped`);
					return;
				}
				const p = ctx.el("text:p", { "text:style-name": "Standard" });
				append(body, p);
				ctx.children(p);
			},
		})),

		// ---- inline --------------------------------------------------------

		// Unlike a docx run, a `<text:span>` nests - so emphasis emits a real
		// element carrying only its own property, and `md:bold > md:italic`
		// survives as two spans rather than collapsing into one combined style.
		// That is why these are elements here and style frames in the docx
		// writer: the difference is a property of the formats, not a choice.
		out("md:bold").to((node, ctx) => span(node, ctx, { bold: true })),
		out("md:italic").to((node, ctx) => span(node, ctx, { italic: true })),
		out("md:bolditalic").to((node, ctx) => span(node, ctx, { bold: true, italic: true })),
		out("md:strikethrough").to((node, ctx) => span(node, ctx, { strike: true })),
		out("md:underline").to((node, ctx) => span(node, ctx, { underline: true })),
		out("md:highlight").to((node, ctx) => span(node, ctx, { highlight: true })),

		out("md:code").to((node, ctx) => ({
			kind: "nodes",
			nodes: styledText(String((node.data as { value?: string }).value ?? ""), ctx, {
				mono: true,
			}),
		})),

		out("md:link").to((node, ctx) => {
			const data = node.data as { href?: string; text?: string };
			const inner = styledText(data.text ?? "", ctx);
			return {
				kind: "nodes",
				nodes: [
					ctx.el(
						"text:a",
						{ "xlink:href": data.href ?? "#", "xlink:type": "simple" },
						inner.length > 0 ? inner : [ctx.txt(data.text ?? "")],
					),
				],
			};
		}),

		out("md:image").to((node, ctx) => {
			const data = node.data as { src?: string; alt?: string };
			const image = ctx.el("draw:image", {
				"xlink:href": data.src ?? "",
				"xlink:type": "simple",
				"xlink:show": "embed",
				"xlink:actuate": "onLoad",
			});
			const frame = ctx.el("draw:frame", {
				"text:anchor-type": "as-char",
				"draw:name": data.alt || (data.src ?? "image"),
			}, [image]);
			if (data.alt) append(frame, ctx.el("svg:title", {}, [ctx.txt(data.alt)]));
			return { kind: "nodes", nodes: [frame] };
		}),

		out("md:linebreak").to((_node, ctx) => ({
			kind: "nodes",
			nodes: [ctx.el("text:line-break")],
		})),

		out("md:raw").to((node, ctx) => ({
			kind: "nodes",
			nodes: [ctx.txt(String((node.data as { value?: string }).value ?? ""))],
		})),

		out("core:text").to((node, ctx) => {
			const value = String((node.data as { value?: string }).value ?? "");
			if (value === "") return { kind: "drop" };
			const spans = styledText(value, ctx);
			return { kind: "nodes", nodes: spans.length > 0 ? spans : [ctx.txt(value)] };
		}),
	];

	return {
		name: "odt",
		nsMap: ODT_WRITE_NS,
		styles,
		emitters,
		assemble(body, ctx) {
			const automatic = [
				...styles.defs.filter((def) => def.type === "character")
					.map((def: StyleDef) => textStyle(def, monoFont)),
				...styles.defs.filter((def) => def.type === "list")
					.map((def: StyleDef) =>
						listStyle(def.id, def.style.list?.kind === "ordered" ? "ordered" : "unordered")
					),
			].join("\n");

			const text = body.map((node) => serializeXml(node)).join("");
			const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<office:document-content ${nsAttrs()} office:version="${ODF_VERSION}">
\t<office:automatic-styles>
${automatic}
\t</office:automatic-styles>
\t<office:body><office:text>${text}</office:text></office:body>
</office:document-content>
`;

			return {
				parts: {
					// No trailing newline: some readers compare the entry byte for
					// byte against the media type.
					"mimetype": MIMETYPE,
					"META-INF/manifest.xml": manifest(),
					"content.xml": content,
					"styles.xml": stylesPart(monoFont),
					"meta.xml": meta(generator),
				},
				primary: "content.xml",
				extension: "odt",
				mediaType: MIMETYPE,
				warnings: [...ctx.warnings],
			} satisfies WriteResult;
		},
	};
}

const CHECK_GLYPH = { on: "☒ ", off: "☐ " };

/**
 * `<text:list-item>` holding a `<text:p>` for the item's own content, with any
 * nested list appended as a *sibling* of that paragraph rather than inside it.
 */
function emitListItem(node: Node, parent: XmlElement, ctx: EmitContext): void {
	const item = ctx.el("text:list-item");
	append(parent, item);

	const p = ctx.el("text:p", { "text:style-name": "Standard" });
	append(item, p);

	if (node.tag === "md:checkitem") {
		// ODF has no checkbox a list item can carry, so the state becomes a
		// glyph. It reads back as literal text, not as a check item.
		const checked = (node.data as { checked?: boolean }).checked === true;
		append(p, ctx.txt(checked ? CHECK_GLYPH.on : CHECK_GLYPH.off));
	}

	for (const child of node.children) {
		ctx.child(LIST_TAGS.has(child.tag) ? item : p, child);
	}
}

const ALIGN: Record<"l" | "c" | "r", string> = { l: "start", c: "center", r: "end" };

function buildTable(node: Node, ctx: EmitContext): XmlElement {
	const rows = node.children.filter((child) => child.tag === "md:tablerow");
	const format = node.children.find((child) => child.tag === "md:tableformat");
	const align = (format?.data as { columns?: ("l" | "c" | "r")[] })?.columns ?? [];
	const columns = Math.max(
		1,
		Number((node.data as { columns?: number }).columns) || 0,
		...rows.map((row) => ((row.data as { columns?: string[] }).columns ?? []).length),
	);

	const table = ctx.el("table:table", { "table:name": "Table1" }, [
		ctx.el("table:table-column", { "table:number-columns-repeated": columns }),
	]);

	rows.forEach((row, index) => {
		const cells = (row.data as { columns?: string[] }).columns ?? [];
		const tr = ctx.el("table:table-row");
		for (let column = 0; column < columns; column++) {
			const p = ctx.el("text:p", { "text:style-name": "Standard" });
			const value = cells[column] ?? "";
			if (value !== "") append(p, ctx.txt(value));
			const cell = ctx.el("table:table-cell", { "office:value-type": "string" }, [p]);
			if (align[column] && align[column] !== "l") {
				p.attrs.set("fo:text-align", ALIGN[align[column]]);
			}
			append(tr, cell);
		}
		// A header row is a real element in ODF, unlike in docx.
		append(index === 0 ? headerRows(table, ctx) : table, tr);
	});

	return table;
}

function headerRows(table: XmlElement, ctx: EmitContext): XmlElement {
	const header = ctx.el("table:table-header-rows");
	append(table, header);
	return header;
}
