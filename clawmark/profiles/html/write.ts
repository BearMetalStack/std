/**
 * @module
 * The HTML write profile.
 *
 * ```ts
 * const out = markdownWith("# Hello", htmlWriter());
 * out.parts["index.html"];
 * ```
 *
 * HTML already had an output path - `toHtml()`, which walks the tree calling
 * each rule's `renderOpen`. That path is not going anywhere and is still the
 * right thing for "markdown in, markup out". What it cannot do is take a
 * *stylesheet*: `renderOpen` returns a hardcoded string and has nowhere to put
 * a class, so a document's own styles could reach docx and odt but not the one
 * format actually made of CSS.
 *
 * So HTML gets a real `WriteProfile` too, and the same `DocumentStyles`
 * registry drives all three. The emitters below reproduce `renderOpen`'s output
 * element for element, with one addition: any node bound to a registered style
 * gains that style's class.
 *
 * **Those two implementations must not drift.** Every class here is read back
 * by a `match()` on the same rule that emits it - `<span class="highlight">`,
 * `<pre class="code">`, `<ul class="none">` - so a change on one side silently
 * breaks `fromHtml` on the other. `html_write_test.ts` pins them together by
 * asserting this profile's output against `toHtml`'s across a corpus covering
 * every rule; if you change a rule's markup, that test is what tells you.
 */

import type {
	AnyEmitter,
	DocumentStyles,
	EmitContext,
	Node,
	StyleBlock,
	WriteProfile,
	WriteResult,
} from "../../types.ts";
import type { AttrMap, SerializeMode, XmlNode } from "../../xml/types.ts";
import { out, outAny } from "../../dsl.ts";
import { append, el, txt } from "../../xml/build.ts";
import { serializeXml } from "../../xml/serialize.ts";
import { XmlParser } from "../../xml/parser.ts";
import { hasBlockChildren, wrapsSoleBlock } from "../../rules/paragraph.ts";
import { breakKind } from "../../rules/extra/mod.ts";
import { toCss } from "../../css.ts";

export interface HtmlWriteOptions {
	/**
	 * Caller-defined named styles. A node bound to one gains the style's class,
	 * and the generated stylesheet carries the rule.
	 */
	styles?: DocumentStyles;
	/**
	 * Where the generated CSS goes. `"part"` (the default) puts it in
	 * `parts["styles.css"]`; `"inline"` puts a `<style>` element at the top of
	 * the document; `"none"` emits none at all, for a caller who serves their
	 * own stylesheet or adopts one into a shadow root via `toCss()`.
	 */
	stylesheet?: "part" | "inline" | "none";
	/** `"fragment"` (the default) or a whole `<!doctype html>` document. */
	document?: "fragment" | "full";
	/**
	 * Serialization target. `"xhtml"` self-closes void elements (`<br/>`) and
	 * writes boolean attributes in canonical form (`disabled="disabled"`)
	 * instead of the bare HTML form. With `document: "full"`, `"xhtml"` also
	 * adds `xmlns`/`xml:lang` on `<html>` and a leading XML declaration.
	 * Default `"html"`.
	 */
	output?: "html" | "xhtml";
	/** Prefix on every emitted class, so styles can be namespaced. */
	classPrefix?: string;
	/** `<title>` for `document: "full"`. Default "Document". */
	title?: string;
	/** `<html lang>` for `document: "full"`. Default "en". */
	lang?: string;
	/** `class` on a rendered page break. Default "pagebreak". */
	pageBreakClass?: string;
	/** Extra emitters, consulted before the built-ins. */
	emitters?: AnyEmitter[];
}

/** Matches `rules/extra/mod.ts`, which reads these back off the `style` attribute. */
const BREAK_CSS: Record<string, string> = {
	page: "break-after:page;page-break-after:always",
	column: "break-after:column;-webkit-column-break-after:always",
};

const TABLE_STATE = "html:table";

interface TableState {
	head: boolean;
	columnAlign?: ("l" | "c" | "r")[];
}

function tableState(ctx: EmitContext): TableState {
	let state = ctx.state.get(TABLE_STATE) as TableState | undefined;
	if (!state) {
		state = { head: false };
		ctx.state.set(TABLE_STATE, state);
	}
	return state;
}

const CELL_ALIGN: Record<string, string> = {
	l: "text-align:left",
	c: "text-align:center",
	r: "text-align:right",
};

/**
 * The element a bound style renders as, when it did not name one.
 *
 * A style's `role` is the same information a reader recovers from a docx
 * `w:outlineLvl` or an ODF `text:h`, so deriving the tag from it keeps the HTML
 * as semantic as the office output rather than flattening everything to a div.
 */
function defaultElement(block: StyleBlock, node: Node): string {
	if (block.element) return block.element;
	if (block.family === "text") return "span";
	if (block.role === "heading") {
		return `h${Math.min(6, Math.max(1, block.headingLevel ?? 1))}`;
	}
	if (block.role === "quote") return "blockquote";
	if (block.role === "code") return "pre";
	// A wrapper around blocks cannot be a `<p>` - the parser closes an open `<p>`
	// the moment a block-level start tag arrives, so the children would escape it.
	return hasBlockChildren(node) ? "div" : "p";
}

/** A write profile that turns a clawmark tree into HTML. */
export function htmlWriter(options: HtmlWriteOptions = {}): WriteProfile {
	const styles = options.styles;
	const prefix = options.classPrefix ?? "";
	const stylesheet = options.stylesheet ?? "part";
	const pageBreakClass = options.pageBreakClass ?? "pagebreak";
	const mode: SerializeMode = options.output ?? "html";

	/**
	 * Attributes for one node, with the bound style's class merged in.
	 *
	 * Every built-in emitter goes through this, which is why the styled fallback
	 * at the bottom only ever sees tags nothing else claimed: binding a *known*
	 * tag decorates the element it already produces (`<blockquote class="verse">`)
	 * rather than replacing it with a shapeless div. That is the opposite of what
	 * the office writers do, and correct in both places - CSS decorates elements,
	 * while docx and odt have only the style name to say anything with.
	 */
	const attrs = (node: Node, extra: AttrMap = {}): AttrMap => {
		const name = styles?.nameFor(node);
		if (name === undefined) return extra;
		const own = prefix + styles!.classFor(name);
		const existing = extra.class;
		return { ...extra, class: existing ? `${existing} ${own}` : own };
	};

	const wrap = (qname: string, extra: AttrMap = {}) => (node: Node, ctx: EmitContext) => ({
		kind: "element" as const,
		el: ctx.el(qname, attrs(node, extra)),
	});

	const data = (node: Node) => node.data as Record<string, unknown>;
	const str = (node: Node, key: string) => String(data(node)[key] ?? "");

	const emitters: AnyEmitter[] = [
		...(options.emitters ?? []),

		// The lexer opens a paragraph around every block, so a heading arrives as
		// `core:paragraph > md:heading`; without this every block gets a redundant
		// `<p>` around it.
		out("core:paragraph").where(wrapsSoleBlock).unwrap(),
		out("core:paragraph").to(wrap("p")),

		// ---- blocks --------------------------------------------------------

		out("md:heading").to((node, ctx) => {
			const level = Math.min(6, Math.max(1, Number(data(node).level) || 1));
			return { kind: "element", el: ctx.el(`h${level}`, attrs(node)) };
		}),

		out("md:blockquote").to(wrap("blockquote")),
		// A blockquote line is a paragraph of its own, matching `blockquoteRule`.
		out("md:lineitem").to(wrap("p")),

		out("md:codeblock").to((node, ctx) => {
			const lang = data(node).lang;
			const code = ctx.el(
				"code",
				lang ? { class: `language-${lang}` } : {},
				[ctx.txt(str(node, "value"))],
			);
			return {
				kind: "nodes",
				nodes: [ctx.el("pre", attrs(node, { class: "code" }), [code])],
			};
		}),

		out("md:hr").to((node, ctx) => ({ kind: "nodes", nodes: [ctx.el("hr", attrs(node))] })),

		out("md:pagebreak").to((node, ctx) => ({
			kind: "nodes",
			nodes: [
				ctx.el(
					"div",
					attrs(node, {
						class: pageBreakClass,
						style: BREAK_CSS[breakKind(node)],
					}),
				),
			],
		})),

		// ---- lists ---------------------------------------------------------

		out("md:orderedlist").to(wrap("ol")),
		out("md:unorderedlist").to((node, ctx) => ({
			kind: "element",
			el: ctx.el("ul", attrs(node, data(node).style === "none" ? { class: "none" } : {})),
		})),
		out("md:listitem").to((node, ctx) => ({
			kind: "element",
			el: ctx.el("li", attrs(node, data(node).style ? { class: "none" } : {})),
		})),
		out("md:checkitem").to((node, ctx) => {
			const li = ctx.el("li", attrs(node));
			append(
				li,
				ctx.el("input", {
					type: "checkbox",
					disabled: true,
					checked: data(node).checked === true,
				}),
			);
			return { kind: "element", el: li };
		}),

		// ---- tables --------------------------------------------------------
		//
		// The head row renders before the alignment row has been seen, so its
		// alignment is not knowable yet; `tableRowRule` centers it instead, and
		// this has to make the same choice or the two disagree.

		out("md:table").to((node, ctx) => {
			tableState(ctx).head = true;
			return { kind: "element", el: ctx.el("table", attrs(node)) };
		}),

		out("md:tableformat").to((node, ctx) => {
			const state = tableState(ctx);
			state.columnAlign = data(node).columns as ("l" | "c" | "r")[];
			state.head = false;
			return { kind: "drop" };
		}),

		out("md:tablerow").to((node, ctx) => {
			const state = tableState(ctx);
			const cellTag = state.head ? "th" : "td";
			const columns = (data(node).columns as string[] | undefined) ?? [];
			const tr = ctx.el("tr", attrs(node));
			columns.forEach((cell, index) => {
				const align = state.head ? "c" : (state.columnAlign?.[index] ?? "l");
				append(tr, ctx.el(cellTag, { style: CELL_ALIGN[align] }, [ctx.txt(cell)]));
			});
			return {
				kind: "nodes",
				nodes: [state.head ? ctx.el("thead", {}, [tr]) : tr],
			};
		}),

		// ---- footnotes -----------------------------------------------------

		out("md:footnote").to((node, ctx) => {
			const id = str(node, "id");
			return {
				kind: "nodes",
				nodes: [
					ctx.el("sup", attrs(node), [
						ctx.el("a", { href: `#fn-${id}`, id: `fnref-${id}` }, [ctx.txt(id)]),
					]),
				],
			};
		}),

		out("md:footnotedef").to((node, ctx) => {
			const id = str(node, "id");
			const aside = ctx.el("aside", attrs(node, { id }));
			append(aside, ctx.el("a", { href: `#fnref-${id}` }, [ctx.txt("↩")]));
			// The trailing space separates the backlink from the note body, and
			// `footnoteDefRule` emits it too - without it the reader gets
			// "↩Some note" and the collapse leaves no word boundary.
			append(aside, ctx.txt(" "));
			return { kind: "element", el: aside };
		}),

		// ---- inline --------------------------------------------------------

		out("md:bold").to(wrap("strong")),
		out("md:italic").to(wrap("em")),
		out("md:bolditalic").to((node, ctx) => {
			const strong = ctx.el("strong", attrs(node));
			const em = ctx.el("em");
			append(strong, em);
			return { kind: "element", el: strong, into: em };
		}),
		out("md:strikethrough").to(wrap("s")),
		out("md:underline").to(wrap("u")),
		out("md:highlight").to(wrap("span", { class: "highlight" })),

		out("md:code").to((node, ctx) => ({
			kind: "nodes",
			nodes: [ctx.el("code", attrs(node), [ctx.txt(str(node, "value"))])],
		})),

		out("md:link").to((node, ctx) => {
			const title = data(node).title;
			return {
				kind: "nodes",
				nodes: [
					ctx.el(
						"a",
						attrs(node, { href: str(node, "href"), title: title as string | undefined }),
						[ctx.txt(str(node, "text"))],
					),
				],
			};
		}),

		out("md:image").to((node, ctx) => ({
			kind: "nodes",
			nodes: [
				ctx.el(
					"img",
					attrs(node, {
						src: str(node, "src"),
						alt: data(node).alt as string | undefined,
						title: data(node).title as string | undefined,
					}),
				),
			],
		})),

		out("md:linebreak").to((node, ctx) => ({
			kind: "nodes",
			nodes: [ctx.el("br", attrs(node))],
		})),

		// Raw markup is parsed rather than spliced in as text: the writer's output
		// is a node tree, and there is no "unescaped string" node to hold it. The
		// parse is lossless for well-formed input and self-closing for the rest,
		// which is strictly better than what concatenation would produce.
		out("md:raw").to((node) => {
			const value = str(node, "value");
			if (value === "") return { kind: "drop" };
			return { kind: "nodes", nodes: new XmlParser(value, { mode: "html" }).parse().children };
		}),

		// ---- caller-defined styles -----------------------------------------
		//
		// Last, not first: a bound tag that a built-in already claims has been
		// decorated with its class by `attrs()` above. This only catches tags no
		// emitter knows - which is exactly the custom-rule case it exists for.
		...(styles
			? [
				outAny()
					.where((node) => styles.nameFor(node) !== undefined)
					.named("out:html-styled")
					.to((node, ctx) => {
						const name = styles.nameFor(node)!;
						const block = styles.resolve(name);
						return {
							kind: "element",
							el: ctx.el(defaultElement(block, node), attrs(node)),
						};
					}),
			]
			: []),
	];

	return {
		name: "html",
		mode,
		emitters,
		assemble(body, ctx): WriteResult {
			const css = styles ? toCss(styles, { classPrefix: prefix }) : "";
			const nodes = [...body];

			if (stylesheet === "inline" && css !== "") {
				// A `<style>` element's content is raw text in HTML, so the CSS must
				// not be escaped - `cdata` is the one node kind that serializes
				// verbatim in both modes.
				nodes.unshift(el("style", {}, [{ kind: "cdata", value: css } as XmlNode]));
			}

			const markup = nodes.map((node) => serializeXml(node, mode)).join("");
			const parts: Record<string, string> = {
				"index.html": options.document === "full"
					? fullDocument(markup, {
						title: options.title ?? "Document",
						lang: options.lang ?? "en",
						css: stylesheet === "part" && css !== "" ? "styles.css" : undefined,
						mode,
					})
					: markup,
			};
			if (stylesheet === "part" && css !== "") parts["styles.css"] = css;

			return {
				parts,
				primary: "index.html",
				extension: "html",
				mediaType: "text/html",
				warnings: [...ctx.warnings],
			};
		},
	};
}

function fullDocument(
	body: string,
	options: { title: string; lang: string; css?: string; mode: SerializeMode },
): string {
	const link = options.css ? `\n\t<link rel="stylesheet" href="${options.css}">` : "";
	const xhtml = options.mode === "xhtml";
	const decl = xhtml ? `<?xml version="1.0" encoding="UTF-8"?>\n` : "";
	const htmlAttrs = xhtml
		? `lang="${options.lang}" xml:lang="${options.lang}" xmlns="http://www.w3.org/1999/xhtml"`
		: `lang="${options.lang}"`;
	return `${decl}<!doctype html>
<html ${htmlAttrs}>
<head>
\t<meta charset="utf-8">
\t<meta name="viewport" content="width=device-width, initial-scale=1">
\t<title>${serializeXml(txt(options.title), options.mode)}</title>${link}
</head>
<body>
${body}
</body>
</html>
`;
}
