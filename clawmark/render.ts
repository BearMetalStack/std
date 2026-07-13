import type { AnyRule, Node, RenderMethod, TokenIdentifier } from "./types.ts";
import { ROOT_TAG } from "./types.ts";
import { escapeHtml } from "./rules/helpers.ts";

/**
 * Rule-driven replacement for v1's `markdownToHtml` traversal. Same shape:
 * walk the tree, call the tag's open renderer, recurse into children, call
 * the close renderer. `core:text` is rendered directly (escaped) since it
 * isn't owned by a plugin rule, matching how the lexer/tree builder treat it.
 */
export class Renderer {
	#rulesByTag: Map<TokenIdentifier, AnyRule>;

	constructor(rules: AnyRule[]) {
		this.#rulesByTag = new Map(rules.map((rule) => [rule.id, rule]));
	}

	renderHtml(root: Node): string {
		const ctx = { renderMethod: "html" as RenderMethod };
		const parts: string[] = [];
		this.#visit(root, ctx, parts);
		return parts.join("");
	}

	#visit(node: Node, ctx: { renderMethod: RenderMethod }, out: string[]) {
		if (node.tag === ROOT_TAG) {
			for (const child of node.children) this.#visit(child, ctx, out);
			return;
		}
		if (node.tag === "core:text") {
			out.push(escapeHtml((node.data as { value: string }).value));
			return;
		}

		const rule = this.#rulesByTag.get(node.tag);
		if (!rule) throw new Error(`No rule registered for tag "${node.tag}"`);

		out.push(rule.renderOpen(node, ctx));
		for (const child of node.children) this.#visit(child, ctx, out);
		out.push(rule.renderClose?.(node, ctx) ?? "");
	}

	/**
	 * Best-effort DOM output. `renderOpen`/`renderClose` always return
	 * strings per the Rule contract (matching v2.ts) - there's no
	 * per-rule "build a real element" hook - so the only faithful way to
	 * produce a live DOM tree from that contract is to render the html
	 * string once and parse it in a single pass.
	 */
	renderDom(root: Node, doc: Document = globalThis.document): DocumentFragment {
		if (!doc) {
			throw new Error("renderDom requires a Document (no `document` in this environment)");
		}
		const html = this.renderHtml(root);
		const range = doc.createRange();
		range.selectNodeContents(doc.body ?? doc.documentElement);
		return range.createContextualFragment(html);
	}
}
