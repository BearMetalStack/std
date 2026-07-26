import type { Rule } from "../types.ts";
import { closeNode, openNode } from "./helpers.ts";

type Data = Record<string, never>;

/**
 * `++underlined++`, in the markdown-it-ins tradition. Markdown proper has no
 * underline, but the office formats this engine reverses do - without a
 * syntax for it, every `<u>`/underline run would be silently flattened.
 */
export const underlineRule: Rule<Data> = {
	id: "md:underline",
	trigger: "+",
	validate: (ctx) => ctx.peek(2) === "++",

	tokenize(ctx) {
		ctx.cursor += 1;
		return { tag: "md:underline", data: {} };
	},

	tree(_token, ctx) {
		if (ctx.currentNode.tag === "md:underline") {
			closeNode(ctx);
		} else {
			openNode(ctx, "md:underline", {});
		}
	},

	renderOpen: () => "<u>",
	renderClose: () => "</u>",

	matchTag: ["u", "ins"],
	match: () => ({ kind: "wrap", tag: "md:underline", data: {} }),

	serialize: (node, ctx) => `++${ctx.children(node)}++`,
};
