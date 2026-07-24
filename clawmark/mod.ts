/**
 * @module
 * Rule-based markup engine - a working implementation of the `Rule`
 * contract sketched in webbies/lib/md/v2.ts. Living here as a testing
 * ground before it graduates into its own library; see types.ts for the
 * handful of places the contract had to grow to make v1-equivalent
 * (headings, emphasis, lists, tables, blockquotes, links, images,
 * footnotes, code, hr) behavior possible.
 */

import type { AnyRule, EngineRule, Node, SerializeOptions } from "./types.ts";
import { Lexer } from "./lexer.ts";
import { TreeBuilder } from "./tree.ts";
import { Renderer } from "./render.ts";
import { MarkdownSerializer } from "./serialize.ts";
import { defaultRules } from "./rules/mod.ts";

export * from "./types.ts";
export { defaultRules } from "./rules/mod.ts";
export { Lexer } from "./lexer.ts";
export { TreeBuilder } from "./tree.ts";
export { Renderer } from "./render.ts";
export { MarkdownSerializer, prefixLines } from "./serialize.ts";

/** Parses `input` into a tree using `rules` (a fresh `defaultRules()` set by default). */
export function parse(input: string, rules: AnyRule[] = defaultRules()): Node {
	const tokens = new Lexer(input, rules).tokenize();
	return new TreeBuilder(rules).build(tokens);
}

/** Parses and renders `input` straight to an HTML string. */
export function toHtml(input: string, rules: AnyRule[] = defaultRules()): string {
	const tree = parse(input, rules);
	return new Renderer(rules).renderHtml(tree);
}

/** Parses and renders `input` to a live DOM fragment (requires a `Document`). */
export function toDom(
	input: string,
	doc?: Document,
	rules: AnyRule[] = defaultRules(),
): DocumentFragment {
	const tree = parse(input, rules);
	return new Renderer(rules).renderDom(tree, doc);
}

/** Serializes a tree back to markdown text - the inverse of `parse`. */
export function toMarkdown(
	tree: Node,
	rules: EngineRule[] = defaultRules(),
	options?: SerializeOptions,
): string {
	return new MarkdownSerializer(rules, options).serialize(tree);
}
