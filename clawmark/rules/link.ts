import type { LexerContext, Node, Rule, Token } from "../types.ts";
import {
	escapeHtml,
	findBalancedClose,
	flattenInline,
	inlineOnly,
	parseInline,
	textFallback,
} from "./helpers.ts";

type LinkData = { href: string; text: string; title?: string };

/** `tokenize`'s only channel back to `tree()` is `Token.data`, so the parsed
 * children ride along next to the public `LinkData` fields until `tree()`
 * splits them back out onto the node proper. */
type LinkToken = LinkData & { children: Node[] };

const HREF_RX = /^(?<href>[\S]*)(?: "(?<title>[\s\S]*)")?\)$/;

/**
 * v1's pre-filter for "does this look like the start of `[text](`" is
 * `/^\[[a-z]*\]\($/i`, which only allows plain letters between the
 * brackets - link text with a space ("[click here](url)") or any
 * punctuation never gets recognized as a link at all. That's a bug, not a
 * feature worth preserving, so this allows any non-`]` text instead.
 */
function isLinkStart(ctx: LexerContext): number | null {
	if (ctx.peek(2) === "[^") return null; // footnote reference/def owns this
	const closeBracket = findBalancedClose(ctx, "[", "]", 1);
	if (closeBracket === null) return null;
	return ctx.peek(1, closeBracket + 1) === "(" ? closeBracket : null;
}

export const linkRule: Rule<LinkData> = {
	id: "md:link",
	trigger: "[",
	validate: (ctx) => isLinkStart(ctx) !== null,

	tokenize(ctx) {
		const closeBracket = isLinkStart(ctx);
		if (closeBracket === null) return textFallback<LinkData>("[");
		const linkTextRaw = ctx.peek(closeBracket - 1, 1);
		const rest = ctx.toNextSubstring(")", closeBracket + 2);
		if (!rest) return textFallback<LinkData>("[");
		const { href, title } = rest.match(HREF_RX)?.groups ?? { href: "#", title: undefined };
		ctx.cursor += closeBracket + 2 + rest.length - 1;
		// A link's own text may not itself contain another link (CommonMark
		// disallows it too); excluding md:link here is what makes that hold -
		// an inner `[...]` just falls through to plain text.
		const rules = inlineOnly(ctx.rules).filter((rule) => rule.id !== "md:link");
		const children = parseInline(linkTextRaw, rules);
		const data: LinkToken = { href, title, text: flattenInline(children), children };
		return { tag: "md:link", data } as unknown as Token<LinkData>;
	},

	tree(token, ctx) {
		const { children, ...data } = token.data as unknown as LinkToken;
		const node: Node<LinkData> = { tag: "md:link", data, children, parent: ctx.currentNode };
		for (const child of children) child.parent = node;
		ctx.currentNode.children.push(node as Node);
	},

	renderOpen(node) {
		const title = node.data.title ? ` title="${escapeHtml(node.data.title)}"` : "";
		// A node built by a reverse profile that never learned to recurse
		// (docx/odt) is still a childless leaf carrying only `data.text` -
		// render that inline rather than an empty link.
		const fallback = node.children.length === 0 ? escapeHtml(node.data.text) : "";
		return `<a href="${escapeHtml(node.data.href)}"${title}>${fallback}`;
	},
	renderClose: () => "</a>",

	matchTag: "a",
	match(el, ctx) {
		const href = el.attrs.get("href");
		// <a name="x"> and <a id="x"> are anchors, not links.
		if (!href) return null;
		// The backlink inside a footnote definition; footnoteDefRule owns it.
		if (href.startsWith("#fnref-")) return { kind: "drop" };
		// The anchor inside a footnote reference; footnoteRule owns the <sup>.
		if (href.startsWith("#fn-") && ctx.parentTag === "md:footnote") {
			return { kind: "drop" };
		}
		// `text` is a flattened compatibility fallback for consumers (the
		// docx/odt/text write profiles) that only ever read flat text off a
		// link and were never taught to walk real children; "wrap" still
		// recurses into `el`'s children (a nested `<img>`, emphasis, ...) to
		// build the real node.children the markdown pipeline renders from.
		const data: Record<string, unknown> = { href, text: ctx.text(el) };
		const title = el.attrs.get("title");
		if (title) data.title = title;
		return { kind: "wrap", tag: "md:link", data };
	},

	serialize(node, ctx) {
		const text = node.children.length > 0
			? ctx.children(node)
			: ctx.escape(node.data.text, "linkText");
		const href = ctx.escape(node.data.href, "linkDest");
		const title = node.data.title ? ` "${ctx.escape(node.data.title, "title")}"` : "";
		return `[${text}](${href}${title})`;
	},
};
