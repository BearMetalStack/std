import type { AnyRule, Node, Token, TokenIdentifier, TreeContext } from "./types.ts";
import { ROOT_TAG } from "./types.ts";

/**
 * Rule-driven replacement for v1's `MarkdownTreeBuilder`. Where v1 has one
 * big switch over every token tag, this just looks the rule up by
 * `token.tag` and calls its `tree()` - the rule owns the open/close/append
 * decision for its own construct.
 */
export class TreeBuilder {
	#root: Node = { tag: ROOT_TAG, data: {}, children: [] };
	#stack: Node[] = [this.#root];
	#rulesByTag: Map<TokenIdentifier, AnyRule>;

	constructor(rules: AnyRule[]) {
		this.#rulesByTag = new Map(rules.map((rule) => [rule.id, rule]));
	}

	get #ctx(): TreeContext {
		const stack = this.#stack;
		return {
			stack,
			get currentNode() {
				return stack[stack.length - 1];
			},
		};
	}

	build(tokens: Iterable<Token>): Node {
		for (const token of tokens) this.#handle(token);
		return this.#root;
	}

	#handle(token: Token) {
		if (token.tag === "core:text") {
			const { value } = token.data as { value: string };
			const parent = this.#stack[this.#stack.length - 1];
			const node: Node = { tag: "core:text", data: { value }, children: [], parent };
			parent.children.push(node);
			return;
		}

		const rule = this.#rulesByTag.get(token.tag);
		if (!rule) {
			throw new Error(`No rule registered for tag "${token.tag}"`);
		}
		rule.tree(token, this.#ctx);
	}
}
