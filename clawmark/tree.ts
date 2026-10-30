import type { AnyRule, Node, Span, Token, TokenIdentifier, TreeContext } from "./types.ts";
import { ROOT_TAG } from "./types.ts";

/**
 * Rule-driven replacement for v1's `MarkdownTreeBuilder`. Where v1 has one
 * big switch over every token tag, this just looks the rule up by
 * `token.tag` and calls its `tree()` - the rule owns the open/close/append
 * decision for its own construct.
 *
 * Rules build nodes without seeing spans, so the builder carries them over by
 * watching what each token did to the stack: a node it created starts where
 * the token starts, and a node it closed ends where the token ends - or where
 * it starts, if the same token also opened something, as a list marker closes
 * the previous item and opens the next.
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
		let first: Span | undefined;
		let last: Span | undefined;
		for (const token of tokens) {
			this.#handle(token);
			first ??= token.span;
			last = token.span ?? last;
		}
		if (first && last) this.#root.span = { start: first.start, end: last.end };
		return this.#root;
	}

	#handle(token: Token) {
		if (token.tag === "core:text") {
			const { value } = token.data as { value: string };
			const parent = this.#stack[this.#stack.length - 1];
			const node: Node = { tag: "core:text", data: { value }, children: [], parent };
			if (token.span) node.span = { ...token.span };
			parent.children.push(node);
			return;
		}

		const rule = this.#rulesByTag.get(token.tag);
		if (!rule) {
			throw new Error(`No rule registered for tag "${token.tag}"`);
		}
		const span = token.span;
		if (!span) {
			rule.tree(token, this.#ctx);
			return;
		}

		const before = [...this.#stack];
		const counts = before.map((node) => node.children.length);
		rule.tree(token, this.#ctx);

		let opened = false;
		before.forEach((node, i) => {
			for (const child of node.children.slice(counts[i])) {
				opened = stamp(child, span) || opened;
			}
		});
		const open = new Set(this.#stack);
		for (const node of before) {
			if (open.has(node) || !node.span) continue;
			node.span.end = Math.max(node.span.start, opened ? span.start : span.end);
		}
	}
}

/** Gives `node` and its unstamped descendants `span`; false if it already had one. */
function stamp(node: Node, span: Span): boolean {
	if (node.span) return false;
	node.span = { ...span };
	for (const child of node.children) stamp(child, span);
	return true;
}
