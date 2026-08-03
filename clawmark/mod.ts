/**
 * @module
 * Rule-based markup engine - a working implementation of the `Rule`
 * contract sketched in webbies/lib/md/v2.ts. Living here as a testing
 * ground before it graduates into its own library; see types.ts for the
 * handful of places the contract had to grow to make v1-equivalent
 * (headings, emphasis, lists, tables, blockquotes, links, images,
 * footnotes, code, hr) behavior possible.
 */

import type { AnyRule, EngineRule, Node, Profile, SerializeOptions } from "./types.ts";
import type { WriteProfile, WriteResult } from "./types.ts";
import type { XmlElement } from "./xml/types.ts";
import { Lexer } from "./lexer.ts";
import { TreeBuilder } from "./tree.ts";
import { Renderer } from "./render.ts";
import { MarkdownSerializer } from "./serialize.ts";
import { Crawler } from "./crawl.ts";
import { renderWith } from "./write.ts";
import { XmlParser } from "./xml/parser.ts";
import { fromDom } from "./xml/dom.ts";
import { defaultRules } from "./rules/mod.ts";
import { htmlProfile } from "./profiles/html/mod.ts";
import type { HtmlProfileOptions } from "./profiles/html/mod.ts";

export * from "./types.ts";
export { defaultRules } from "./rules/mod.ts";
export { Lexer } from "./lexer.ts";
export { TreeBuilder } from "./tree.ts";
export { Renderer } from "./render.ts";
export { MarkdownSerializer, prefixLines } from "./serialize.ts";
export { Crawler, postProcess } from "./crawl.ts";
export { createResourceSink, MarkupWriter, renderWith, singlePart } from "./write.ts";
export * from "./xml/mod.ts";
export * from "./style.ts";
export * from "./dsl.ts";
export { htmlProfile } from "./profiles/html/mod.ts";
export type { HtmlProfileOptions } from "./profiles/html/mod.ts";

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

/**
 * Crawls an XML/HTML document into a clawmark tree using `profile`'s rules.
 * Accepts either source text or an already-parsed element, so a caller who has
 * unzipped a `.docx` can hand over the parsed `document.xml` directly.
 */
export function fromXml(source: string | XmlElement, profile: Profile): Node {
	const root = typeof source === "string"
		? new XmlParser(source, profile.parse ?? {}).parse()
		: source;
	return new Crawler({
		rules: profile.rules,
		mode: profile.parse?.mode ?? "xml",
		styles: profile.styles,
		styleTable: profile.styleTable,
		unmatched: profile.unmatched,
		unmatchedByTag: profile.unmatchedByTag,
	}).crawl(root);
}

/** Crawls HTML into a clawmark tree. Accepts source text or a live DOM node. */
export function fromHtml(
	source: string | XmlElement | Element | Document | DocumentFragment,
	options?: HtmlProfileOptions,
): Node {
	const profile = htmlProfile(options);
	if (typeof source === "string") return fromXml(source, profile);
	// An XmlElement already has the shape we need; anything else is live DOM.
	const root = "kind" in source ? source as XmlElement : fromDom(source);
	return fromXml(root, profile);
}

/** The whole reverse pipeline: XML/HTML source to markdown text. */
export function xmlToMarkdown(
	source: string | XmlElement,
	profile: Profile,
	options?: SerializeOptions,
): string {
	return toMarkdown(fromXml(source, profile), profile.rules, options);
}

/** The whole reverse pipeline for HTML - the inverse of `toHtml`. */
export function htmlToMarkdown(
	source: string | XmlElement | Element | Document | DocumentFragment,
	options: HtmlProfileOptions & SerializeOptions = {},
): string {
	return toMarkdown(fromHtml(source, options), htmlProfile(options).rules, options);
}

/** Parses markdown and renders it through a write profile in one step. */
export function markdownWith(
	input: string,
	profile: WriteProfile,
	rules: AnyRule[] = defaultRules(),
): WriteResult {
	return renderWith(parse(input, rules), profile);
}

/**
 * Markup in, markup out - the whole conversion pipeline through the tree.
 *
 * The tree carries no source-format context, so this **regenerates** rather
 * than preserves: a non-conformant document read through `from` comes back out
 * built to `to`'s idea of correct, not reproduced. That is the point of it.
 * Anything the node vocabulary and `ResolvedStyle` cannot express is lost, the
 * same trade `xmlToMarkdown` already makes.
 */
export function convert(
	source: string | XmlElement,
	from: Profile,
	to: WriteProfile,
): WriteResult {
	return renderWith(fromXml(source, from), to);
}
