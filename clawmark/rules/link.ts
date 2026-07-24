import type { Rule } from "../types.ts";
import { appendLeaf, escapeHtml, textFallback } from "./helpers.ts";

type LinkData = { href: string; text: string; title?: string };

const LINK_BODY_RX = /\[(?<text>[\s\S]*)\]\((?<href>[\S]*)(?: "(?<title>[\s\S]*)")?\)/;

/**
 * v1's pre-filter for "does this look like the start of `[text](`" is
 * `/^\[[a-z]*\]\($/i`, which only allows plain letters between the
 * brackets - link text with a space ("[click here](url)") or any
 * punctuation never gets recognized as a link at all. That's a bug, not a
 * feature worth preserving, so this allows any non-`]` text instead.
 */
const LINK_START_RX = /^\[[^\]\n]*\]\($/;

export const linkRule: Rule<LinkData> = {
	id: "md:link",
	trigger: "[",
	validate(ctx) {
		if (ctx.peek(2) === "[^") return false; // footnote reference/def owns this
		const start = ctx.toNextSubstring("(");
		return start !== "" && LINK_START_RX.test(start);
	},

	tokenize(ctx) {
		const linkStr = ctx.toNextSubstring(")");
		if (!linkStr) return textFallback<LinkData>("[");
		const { text, href, title } = linkStr.match(LINK_BODY_RX)?.groups ??
			{ text: "", href: "#", title: undefined };
		ctx.cursor += linkStr.length - 1;
		return { tag: "md:link", data: { text, href, title } };
	},

	tree: (token, ctx) => appendLeaf(ctx, "md:link", token.data),

	renderOpen(node) {
		const title = node.data.title ? ` title="${escapeHtml(node.data.title)}"` : "";
		return `<a href="${escapeHtml(node.data.href)}"${title}>${escapeHtml(node.data.text)}</a>`;
	},

	/**
	 * Link text and destination live in `data`, never as child nodes, so they
	 * never pass through core:text and need their own escaping pass.
	 */
	serialize(node, ctx) {
		const text = ctx.escape(node.data.text, "linkText");
		const href = ctx.escape(node.data.href, "linkDest");
		const title = node.data.title ? ` "${ctx.escape(node.data.title, "title")}"` : "";
		return `[${text}](${href}${title})`;
	},
};
