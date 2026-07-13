import type { Rule } from "../types.ts";
import { closeNode, openNode } from "./helpers.ts";

type Data = Record<string, never>;

export const strikethroughRule: Rule<Data> = {
	id: "md:strikethrough",
	trigger: "~",
	validate: (ctx) => ctx.peek(2) === "~~",

	tokenize(ctx) {
		ctx.cursor += 1;
		return { tag: "md:strikethrough", data: {} };
	},

	tree(_token, ctx) {
		if (ctx.currentNode.tag === "md:strikethrough") {
			closeNode(ctx);
		} else {
			openNode(ctx, "md:strikethrough", {});
		}
	},

	renderOpen: () => "<s>",
	renderClose: () => "</s>",
};
