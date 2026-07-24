import type { Rule } from "../types.ts";
import { appendLeaf } from "./helpers.ts";

type RawData = { value: string };

/**
 * Verbatim markup passthrough, produced by the crawler's `raw` unmatched
 * policy. Nothing in markdown syntax creates one, so `validate` never fires -
 * but unlike the DSL's reverse-only rules, this one genuinely owns a *node
 * tag*, and `TreeBuilder`/`Renderer` throw on an unregistered tag. So it needs
 * the full forward contract, stubs and all.
 */
export const rawRule: Rule<RawData> = {
	id: "md:raw",
	trigger: "<",
	validate: () => false,
	tokenize: () => ({ tag: "md:raw", data: { value: "" } }),

	tree: (token, ctx) => appendLeaf(ctx, "md:raw", token.data),

	// Deliberately unescaped - the whole point is to pass markup through.
	renderOpen: (node) => node.data.value,

	serializeKind: "block",
	serialize: (node) => node.data.value,
};
