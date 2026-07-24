import type { AnyRule, LexerContext, Rule, Token, TreeContext } from "../types.ts";
import { closeNode, consumeRestOfLine, openNode } from "./helpers.ts";

type EmphasisTag = "md:italic" | "md:bold" | "md:bolditalic";
type EmphasisData = Record<string, never>;

/**
 * Run-length of a `*`/`_` delimiter starting at the cursor, capped at 3.
 * Transliterated as-is from v1 (webbies/lib/md/lexer.ts) - the two regexes
 * independently estimate the run assuming a leading `_` vs a leading `*`
 * and take the max, which is how v1 tolerates mixed `*`/`_` runs without a
 * cleaner grammar. Not worth "fixing" here since matching v1 is the goal.
 */
function runLength(ctx: LexerContext): number {
	return Math.max(
		ctx.peek(3).match(/^[_*]\*{0,2}/)?.[0].length ?? 1,
		ctx.peek(3).match(/^\*(?:\*[\*_]?)?/)?.[0].length ?? 1,
	);
}

function tagFor(type: number): EmphasisTag {
	if (type >= 3) return "md:bolditalic";
	if (type === 2) return "md:bold";
	return "md:italic";
}

function tokenize(ctx: LexerContext): Token {
	if (ctx.peek(3) === "___") {
		consumeRestOfLine(ctx);
		return { tag: "md:hr", data: {} };
	}
	const type = runLength(ctx);
	ctx.cursor += type - 1;
	return { tag: tagFor(type), data: {} };
}

/** Toggle open/close: mirrors v1's tree.ts checking `current.type === tag`. */
function toggle(tag: EmphasisTag, ctx: TreeContext) {
	if (ctx.currentNode.tag === tag) {
		closeNode(ctx);
	} else if (ctx.currentNode.tag !== "md:code" && ctx.currentNode.tag !== "md:codeblock") {
		openNode(ctx, tag, {});
	}
}

/** Fires the shared tokenizer for either delimiter character. */
const emphasisStarTrigger: AnyRule = {
	id: "md:emphasis-star",
	trigger: "*",
	validate: () => true,
	tokenize,
	tree: () => {},
	renderOpen: () => "",
};

const emphasisUnderscoreTrigger: AnyRule = {
	id: "md:emphasis-underscore",
	trigger: "_",
	validate: () => true,
	tokenize,
	tree: () => {},
	renderOpen: () => "",
};

export const italicRule: Rule<EmphasisData> = {
	id: "md:italic",
	trigger: "*",
	validate: () => false,
	tokenize: () => ({ tag: "md:italic", data: {} }),
	tree: (_token, ctx) => toggle("md:italic", ctx),
	matchTag: ["em", "i"],
	match: () => ({ kind: "wrap", tag: "md:italic", data: {} }),

	renderOpen: () => "<em>",
	renderClose: () => "</em>",

	serialize: (node, ctx) => {
		const d = ctx.options.emphasis;
		return `${d}${ctx.children(node)}${d}`;
	},
};

export const boldRule: Rule<EmphasisData> = {
	id: "md:bold",
	trigger: "*",
	validate: () => false,
	tokenize: () => ({ tag: "md:bold", data: {} }),
	tree: (_token, ctx) => toggle("md:bold", ctx),
	matchTag: ["strong", "b"],
	match: () => ({ kind: "wrap", tag: "md:bold", data: {} }),

	renderOpen: () => "<strong>",
	renderClose: () => "</strong>",

	serialize: (node, ctx) => {
		const d = ctx.options.strong;
		return `${d}${ctx.children(node)}${d}`;
	},
};

export const boldItalicRule: Rule<EmphasisData> = {
	id: "md:bolditalic",
	trigger: "*",
	validate: () => false,
	tokenize: () => ({ tag: "md:bolditalic", data: {} }),
	tree: (_token, ctx) => toggle("md:bolditalic", ctx),
	renderOpen: () => "<strong><em>",
	renderClose: () => "</em></strong>",

	serialize: (node, ctx) => {
		const d = ctx.options.strong + ctx.options.emphasis;
		return `${d}${ctx.children(node)}${d}`;
	},
};

export const emphasisRules: AnyRule[] = [
	emphasisStarTrigger,
	emphasisUnderscoreTrigger,
	italicRule,
	boldRule,
	boldItalicRule,
];
