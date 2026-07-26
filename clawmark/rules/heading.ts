import type { Rule } from "../types.ts";
import { closeNode, openNode } from "./helpers.ts";

type HeadingData = { level: number; phase: "open" | "close" };

export const headingRule: Rule<HeadingData> = {
	id: "md:heading",
	trigger: "#",
	validate: (ctx) => ctx.cursor === ctx.lineStart,

	tokenize(ctx) {
		const level = ctx.peek(6).match(/^#{1,6}/)?.[0].length ?? 1;
		ctx.cursor += level - 1;
		// v1 (webbies/lib/md/lexer.ts) leaves the space after "#"s as literal
		// content ("# Title" -> " Title") - stripping it here instead, since
		// every markdown flavor treats it as marker syntax, not text.
		if (ctx.peek(1, 1) === " ") ctx.cursor += 1;
		ctx.pushBlock("md:heading", { singleLine: true });
		return { tag: "md:heading", data: { level, phase: "open" } };
	},

	tree(token, ctx) {
		if (token.data.phase === "open") {
			openNode(ctx, "md:heading", token.data);
		} else {
			closeNode(ctx);
		}
	},

	renderOpen(node) {
		return `<h${node.data.level}>`;
	},
	renderClose(node) {
		return `</h${node.data.level}>`;
	},

	matchTag: ["h1", "h2", "h3", "h4", "h5", "h6"],
	match: (el) => ({
		kind: "wrap",
		tag: "md:heading",
		data: { level: Number(el.name[1]), phase: "open" },
	}),

	serializeKind: "block",
	serialize: (node, ctx) => `${"#".repeat(node.data.level)} ${ctx.children(node)}`,
};
