import type { Rule } from "../types.ts";
import { appendLeaf, escapeHtml, findBalancedClose, textFallback } from "./helpers.ts";

type ImageData = { src: string; alt?: string; title?: string };

const SRC_RX = /^(?<src>[\S]*)(?: "(?<title>[\s\S]*)")?\)$/;

export const imageRule: Rule<ImageData> = {
	id: "md:image",
	trigger: "!",
	validate: (ctx) => ctx.peek(2) === "![",

	tokenize(ctx) {
		// Alt text is never re-lexed (an `<img alt>` cannot itself contain
		// markup), but its own boundary still has to be found by balancing
		// `[`/`]` rather than jumping to the *nearest* `]` - the same
		// nearest-delimiter bug rules/link.ts had, here in miniature: alt text
		// containing a stray `]` would otherwise truncate early.
		const closeBracket = findBalancedClose(ctx, "[", "]", 2);
		if (closeBracket === null) return textFallback<ImageData>("!");
		const alt = ctx.peek(closeBracket - 2, 2) || undefined;
		if (ctx.peek(1, closeBracket + 1) !== "(") return textFallback<ImageData>("!");
		const rest = ctx.toNextSubstring(")", closeBracket + 2);
		if (!rest) return textFallback<ImageData>("!");
		const { src, title } = rest.match(SRC_RX)?.groups ?? { src: "", title: undefined };
		ctx.cursor += closeBracket + 2 + rest.length - 1;
		return { tag: "md:image", data: { src, alt, title } };
	},

	tree: (token, ctx) => appendLeaf(ctx, "md:image", token.data),

	renderOpen(node) {
		const alt = node.data.alt ? ` alt="${escapeHtml(node.data.alt)}"` : "";
		const title = node.data.title ? ` title="${escapeHtml(node.data.title)}"` : "";
		return `<img src="${escapeHtml(node.data.src)}"${alt}${title}>`;
	},

	matchTag: "img",
	match(el) {
		const src = el.attrs.get("src");
		if (!src) return null;
		const data: Record<string, unknown> = { src };
		const alt = el.attrs.get("alt");
		const title = el.attrs.get("title");
		if (alt) data.alt = alt;
		if (title) data.title = title;
		return { kind: "leaf", tag: "md:image", data };
	},

	serialize(node, ctx) {
		const alt = ctx.escape(node.data.alt ?? "", "linkText");
		const src = ctx.escape(node.data.src, "linkDest");
		const title = node.data.title ? ` "${ctx.escape(node.data.title, "title")}"` : "";
		return `![${alt}](${src}${title})`;
	},
};
