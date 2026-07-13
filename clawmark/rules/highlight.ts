import type { Rule } from "../types.ts";
import { closeNode, openNode } from "./helpers.ts";

type Data = Record<string, never>;

export const highlightRule: Rule<Data> = {
	id: "md:highlight",
	trigger: "=",
	validate: (ctx) => ctx.peek(2) === "==",

	tokenize(ctx) {
		ctx.cursor += 1;
		return { tag: "md:highlight", data: {} };
	},

	tree(_token, ctx) {
		if (ctx.currentNode.tag === "md:highlight") {
			closeNode(ctx);
		} else {
			openNode(ctx, "md:highlight", {});
		}
	},

	renderOpen: () => `<span class="highlight">`,
	renderClose: () => "</span>",
};
