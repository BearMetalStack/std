import type { Rule } from "../types.ts";
import { appendLeaf, consumeRestOfLine } from "./helpers.ts";

type Data = Record<string, never>;

export const hrRule: Rule<Data> = {
	id: "md:hr",
	trigger: "-",
	validate: (ctx) => ctx.cursor === ctx.lineStart && ctx.peek(3) === "---",

	tokenize(ctx) {
		consumeRestOfLine(ctx);
		return { tag: "md:hr", data: {} };
	},

	tree: (_token, ctx) => appendLeaf(ctx, "md:hr", {}),
	renderOpen: () => "<hr>",

	matchTag: "hr",
	match: () => ({ kind: "leaf", tag: "md:hr", data: {} }),

	serializeKind: "block",
	serialize: () => "---",
};
