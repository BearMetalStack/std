import type { Rule } from "../types.ts";
import { appendLeaf, escapeHtml, textFallback } from "./helpers.ts";

type ImageData = { src: string; alt?: string; title?: string };

const IMAGE_RX = /!\[(?<alt>[\s\S]*)\]\((?<src>[\S]*)(?: "(?<title>[\s\S]*)")?\)/;

export const imageRule: Rule<ImageData> = {
	id: "md:image",
	trigger: "!",
	validate: (ctx) => ctx.peek(2) === "![",

	tokenize(ctx) {
		const imgStr = ctx.toNextSubstring(")");
		if (!imgStr) return textFallback<ImageData>("!");
		const { alt, src, title } = imgStr.match(IMAGE_RX)?.groups ??
			{ alt: undefined, src: "", title: undefined };
		ctx.cursor += imgStr.length - 1;
		return { tag: "md:image", data: { src, alt, title } };
	},

	tree: (token, ctx) => appendLeaf(ctx, "md:image", token.data),

	renderOpen(node) {
		const alt = node.data.alt ? ` alt="${escapeHtml(node.data.alt)}"` : "";
		const title = node.data.title ? ` title="${escapeHtml(node.data.title)}"` : "";
		return `<img src="${escapeHtml(node.data.src)}"${alt}${title}>`;
	},
};
