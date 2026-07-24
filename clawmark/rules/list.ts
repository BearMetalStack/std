import type { AnyRule, LexerContext, Rule, Token, TokenIdentifier, TreeContext } from "../types.ts";
import { closeIfCurrentIs, closeNode, openNode } from "./helpers.ts";

type ListTag = "md:orderedlist" | "md:unorderedlist";
type ListData = { phase: "open" | "close"; style?: "none" };
type ItemData = { phase: "open" | "close"; style?: "none" };
type CheckItemData = { phase: "open" | "close"; checked: boolean };

interface StackEntry {
	indent: number;
	tag: ListTag;
}

const ITEM_TAGS: TokenIdentifier[] = ["md:listitem", "md:checkitem"];

/**
 * Nested list open/close, list-item, and checklist-item all need to share
 * one indent-tracked stack (an ordered list can sit inside an unordered one
 * and vice versa) - fresh per parse, so this is a factory rather than a
 * plain rule object, same reasoning as tables. This replaces v1's
 * `listStack` + the token sequencing in its `case "-"` / `case "."`
 * (webbies/lib/md/lexer.ts), which is followed here for indent comparison
 * and marker consumption, but reworked for *nesting*: v1's nested-item
 * branch emits an extra placeholder `listitem` immediately before opening
 * the nested list, which - as far as this port could tell by tracing
 * tree.ts's open/close handling - closes the parent item rather than
 * nesting under it. That looks like a bug rather than an intended visual
 * result, so nesting here is done directly: a deeper marker opens its list
 * as a child of whatever item is currently open.
 */
export function createListRules(): AnyRule[] {
	const stack: StackEntry[] = [];

	function openList(
		ctx: LexerContext,
		indent: number,
		tag: ListTag,
		tokens: Token[],
		style?: "none",
	) {
		stack.push({ indent, tag });
		ctx.pushBlock(tag);
		tokens.push({ tag, data: { phase: "open", style } });
	}

	/** Closes deeper/mismatched levels, then opens or continues at `indent`. */
	function enterItem(
		ctx: LexerContext,
		indent: number,
		tag: ListTag,
		itemToken: Token,
		style?: "none",
	): Token[] {
		const tokens: Token[] = [];

		while (stack.length > 0 && stack[stack.length - 1].indent > indent) {
			const top = stack.pop()!;
			ctx.popBlock();
			tokens.push({ tag: top.tag, data: { phase: "close" } });
		}

		const top = stack[stack.length - 1];
		if (!top || top.indent < indent) {
			openList(ctx, indent, tag, tokens, style);
		} else if (top.tag !== tag) {
			stack.pop();
			ctx.popBlock();
			tokens.push({ tag: top.tag, data: { phase: "close" } });
			openList(ctx, indent, tag, tokens, style);
		}

		tokens.push(itemToken);
		return tokens;
	}

	function closeList(ctx: TreeContext) {
		closeIfCurrentIs(ctx, ...ITEM_TAGS);
		closeNode(ctx);
	}

	const orderedListRule: Rule<ListData> = {
		id: "md:orderedlist",
		trigger: ".",
		validate(ctx) {
			const before = ctx.currentLine.slice(0, ctx.cursor - ctx.lineStart);
			if (!/^\s*\d+$/.test(before)) return false;
			ctx.discardBuffer(); // the digits were a marker, not text - see types.ts
			return true;
		},

		tokenize(ctx) {
			const before = ctx.currentLine.slice(0, ctx.cursor - ctx.lineStart);
			const indent = before.match(/^(\s*)\d+$/)?.[1].length ?? 0;
			ctx.cursor += 1;
			return enterItem(ctx, indent, "md:orderedlist", {
				tag: "md:listitem",
				data: { phase: "open" },
			}) as Token<ListData>[];
		},

		tree(token, ctx) {
			if (token.data.phase === "open") openNode(ctx, "md:orderedlist", token.data);
			else closeList(ctx);
		},

		renderOpen: () => "<ol>",
		renderClose: () => "</ol>",
	};

	const unorderedListRule: Rule<ListData> = {
		id: "md:unorderedlist",
		trigger: "-",
		validate(ctx) {
			if (ctx.cursor === ctx.lineStart && ctx.peek(3) === "---") return false; // hrRule owns this
			const before = ctx.currentLine.slice(0, ctx.cursor - ctx.lineStart);
			if (!/^\s*$/.test(before)) return false;
			// `before` is pure indentation, not content - see the discardBuffer
			// note on orderedListRule for why this has to happen in validate.
			ctx.discardBuffer();
			return true;
		},

		tokenize(ctx) {
			const indent = ctx.cursor - ctx.lineStart;
			const isCheck = /^- \[[ x]\]/.test(ctx.peek(5));
			if (isCheck) {
				const checked = ctx.peek(5).includes("x");
				const tokens = enterItem(
					ctx,
					indent,
					"md:unorderedlist",
					{ tag: "md:checkitem", data: { phase: "open", checked } },
					"none",
				);
				ctx.cursor += ctx.peek(1, 5) === " " ? 5 : 4;
				return tokens as Token<ListData>[];
			}
			const tokens = enterItem(ctx, indent, "md:unorderedlist", {
				tag: "md:listitem",
				data: { phase: "open" },
			});
			ctx.cursor += 1;
			return tokens as Token<ListData>[];
		},

		tree(token, ctx) {
			if (token.data.phase === "open") openNode(ctx, "md:unorderedlist", token.data);
			else closeList(ctx);
		},

		renderOpen: (node) => `<ul${node.data.style === "none" ? ' class="none"' : ""}>`,
		renderClose: () => "</ul>",
	};

	const listItemRule: Rule<ItemData> = {
		id: "md:listitem",
		trigger: "-",
		validate: () => false,
		tokenize: () => ({ tag: "md:listitem", data: { phase: "open" } }),

		tree(_token, ctx) {
			closeIfCurrentIs(ctx, ...ITEM_TAGS);
			openNode(ctx, "md:listitem", { phase: "open" });
		},

		renderOpen: (node) => `<li${node.data.style ? ' class="none"' : ""}>`,
		renderClose: () => "</li>",
	};

	const checkItemRule: Rule<CheckItemData> = {
		id: "md:checkitem",
		trigger: "-",
		validate: () => false,
		tokenize: () => ({ tag: "md:checkitem", data: { phase: "open", checked: false } }),

		tree(token, ctx) {
			closeIfCurrentIs(ctx, ...ITEM_TAGS);
			openNode(ctx, "md:checkitem", token.data);
		},

		renderOpen: (node) =>
			`<li><input type="checkbox" disabled${node.data.checked ? " checked" : ""}>`,
		renderClose: () => "</li>",
	};

	return [orderedListRule, unorderedListRule, listItemRule, checkItemRule];
}
