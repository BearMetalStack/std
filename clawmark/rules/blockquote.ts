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

	matchTag: "blockquote",
	match: () => ({ kind: "wrap", tag: "md:blockquote", data: { phase: "open" } }),

	renderOpen: () => "<blockquote>",
	renderClose: () => "</blockquote>",

	serializeKind: "block",
	/**
	 * Line items join with a *single* newline, never a blank line. A blank
	 * line closes the block in the forward lexer, and a bare `>` line makes
	 * `blockquoteRule.tokenize` emit an md:linebreak instead of an
	 * md:lineitem - so `> a\n>\n> b` is not a fixed point. Nested quotes fall
	 * out for free: the inner one already returned `> x`, and prefixing again
	 * gives `> > x`.
	 */
	serialize(node, ctx) {
		const inner = node.children.map((child) => ctx.node(child)).join("\n");
		return ctx.prefixLines(inner, "> ", "> ", ">");
	},
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

	matchTag: "p",
	match: (_el, ctx) =>
		ctx.parentTag === "md:blockquote"
			? { kind: "wrap", tag: "md:lineitem", data: { phase: "open" } }
			: null,

	renderOpen: () => "<p>",
	renderClose: () => "</p>",

	serializeKind: "block",
	serialize: (node, ctx) => ctx.children(node),
};
