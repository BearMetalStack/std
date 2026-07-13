import type { Rule, Token } from "../types.ts";
import { closeIfCurrentIs, closeNode, openNode } from "./helpers.ts";

type Data = { phase: "open" | "close" };
type LineItemData = { phase: "open" | "close" };

export const blockquoteRule: Rule<Data> = {
	id: "md:blockquote",
	trigger: ">",
	validate: (ctx) => ctx.cursor === ctx.lineStart,

	tokenize(ctx) {
		const tokens: Token<Data>[] = [];
		if (ctx.currentBlock !== "md:blockquote") {
			ctx.pushBlock("md:blockquote");
			tokens.push({ tag: "md:blockquote", data: { phase: "open" } });
		}
		if (ctx.peek(1, 1) === "\n") {
			tokens.push({ tag: "md:linebreak", data: { phase: "open" } });
		} else {
			tokens.push({ tag: "md:lineitem", data: { phase: "open" } });
			ctx.cursor += 1;
		}
		return tokens;
	},

	tree(token, ctx) {
		if (token.data.phase === "open") {
			openNode(ctx, "md:blockquote", token.data);
		} else {
			closeIfCurrentIs(ctx, "md:lineitem");
			closeNode(ctx);
		}
	},

	renderOpen: () => "<blockquote>",
	renderClose: () => "</blockquote>",
};

export const lineItemRule: Rule<LineItemData> = {
	id: "md:lineitem",
	trigger: ">",
	validate: () => false,
	tokenize: () => ({ tag: "md:lineitem", data: { phase: "open" } }),

	tree(_token, ctx) {
		closeIfCurrentIs(ctx, "md:lineitem");
		openNode(ctx, "md:lineitem", { phase: "open" });
	},

	renderOpen: () => "<p>",
	renderClose: () => "</p>",
};
