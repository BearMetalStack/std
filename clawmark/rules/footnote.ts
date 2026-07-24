import type { Rule } from "../types.ts";
import { appendLeaf, closeNode, escapeHtml, openNode, textFallback } from "./helpers.ts";

type RefData = { id: string };
type DefData = { id: string; phase: "open" | "close" };

const ID_RX = /\[\^(?<id>[a-z0-9]*)\]/i;

/** Bare reference, e.g. `noted[^1]`. */
export const footnoteRule: Rule<RefData> = {
	id: "md:footnote",
	trigger: "[",
	validate(ctx) {
		if (ctx.peek(2) !== "[^") return false;
		// A definition line (`[^1]: text`) belongs to footnoteDefRule instead -
		// registered first in the ruleset so it gets first refusal, but this
		// stays self-sufficient regardless of registration order.
		const refStr = ctx.toNextSubstring("]");
		return !(refStr !== "" && ctx.peek(refStr.length + 2) === refStr + ": ");
	},

	tokenize(ctx) {
		const refStr = ctx.toNextSubstring("]");
		if (!refStr) return textFallback<RefData>("[^");

		const { id = "" } = refStr.match(ID_RX)?.groups ?? {};
		ctx.cursor += refStr.length - 1;
		return { tag: "md:footnote", data: { id } };
	},

	tree: (token, ctx) => appendLeaf(ctx, "md:footnote", token.data),
	renderOpen: (node) => {
		const id = escapeHtml(node.data.id);
		return `<sup><a href="#fn-${id}" id="fnref-${id}">${id}</a></sup>`;
	},

	serialize: (node) => `[^${node.data.id}]`,
};

/** Definition, e.g. `[^1]: Some note text`. */
export const footnoteDefRule: Rule<DefData> = {
	id: "md:footnotedef",
	trigger: "[",
	validate(ctx) {
		if (ctx.peek(2) !== "[^") return false;
		const refStr = ctx.toNextSubstring("]");
		return refStr !== "" && ctx.peek(refStr.length + 2) === refStr + ": ";
	},

	tokenize(ctx) {
		const refStr = ctx.toNextSubstring("]");
		const { id = "" } = refStr.match(ID_RX)?.groups ?? {};
		ctx.pushBlock("md:footnotedef");
		// validate() already confirmed refStr is followed by ": " - consume
		// through that guaranteed separator too, not just the `[^id]` marker.
		ctx.cursor += refStr.length + 1;
		return { tag: "md:footnotedef", data: { id, phase: "open" } };
	},

	tree(token, ctx) {
		if (token.data.phase === "open") {
			openNode(ctx, "md:footnotedef", token.data);
		} else {
			closeNode(ctx);
		}
	},

	renderOpen: (node) => {
		const id = escapeHtml(node.data.id);
		return `<aside id="${id}"><a href="#fnref-${id}">↩</a> `;
	},
	renderClose: () => "</aside>",

	serializeKind: "block",
	// Definitions keep their position in the tree rather than being hoisted to
	// the document end - that is where the forward lexer puts them, so
	// preserving position is what round-trips.
	serialize: (node, ctx) => `[^${node.data.id}]: ${ctx.children(node)}`,
};
