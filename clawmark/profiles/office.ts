/**
 * @module
 * Shared machinery for the two office profiles.
 *
 * docx and odt disagree about almost everything, but they agree on the one
 * thing that makes reading them awkward: **a multi-paragraph block is not an
 * element, it is a run of consecutive paragraphs that happen to share a
 * style.** A blockquote, a code block, and a list all arrive that way, and the
 * reconstruction is identical in both formats down to the local element name -
 * `w:p` and `text:p` both have the local name `p`.
 *
 * `docxProfile` already had this shape hand-rolled for lists (`buildList`).
 * These are the same pattern, factored out so the code, quote, and list
 * collectors do not exist three times in two files.
 */

import type { MatchContext, Node, ResolvedStyle } from "../types.ts";
import type { XmlElement } from "../xml/types.ts";

/** Per-document set of elements some collector has already swallowed. */
export function markSet(ctx: MatchContext, key: string): Set<XmlElement> {
	let set = ctx.state.get(key) as Set<XmlElement> | undefined;
	if (!set) {
		set = new Set();
		ctx.state.set(key, set);
	}
	return set;
}

/** Sibling `<w:p>` / `<text:p>` elements, in document order. */
export function siblingParagraphs(el: XmlElement): XmlElement[] {
	return (el.parent?.children ?? []).filter(
		(c): c is XmlElement => c.kind === "element" && c.name === "p",
	);
}

/**
 * The maximal run of sibling paragraphs starting at `el` whose resolved style
 * satisfies `pred`, marking every one consumed.
 *
 * Returns null when `el` was already claimed by an earlier run, which is the
 * caller's signal to drop it - the first paragraph of a run takes all of them,
 * so every later one arrives here having already been handled.
 */
export function takeParagraphRun(
	el: XmlElement,
	ctx: MatchContext,
	key: string,
	pred: (style: ResolvedStyle) => boolean,
): XmlElement[] | null {
	const seen = markSet(ctx, key);
	if (seen.has(el)) return null;

	const siblings = siblingParagraphs(el);
	const run: XmlElement[] = [];
	for (let i = siblings.indexOf(el); i < siblings.length; i++) {
		if (!pred(ctx.styleOf(siblings[i]))) break;
		seen.add(siblings[i]);
		run.push(siblings[i]);
	}
	return run;
}

/**
 * Rejoins a run of code paragraphs into one `md:codeblock`.
 *
 * `ctx.raw` rather than `ctx.text`: indentation inside a code block is content,
 * and the crawler's whitespace collapsing would eat it.
 */
export function codeBlockValue(run: readonly XmlElement[], ctx: MatchContext): string {
	return run.map((paragraph) => ctx.raw(paragraph)).join("\n");
}

/**
 * Builds an `md:blockquote` whose children are one `md:lineitem` per paragraph
 * in the run - the shape the forward lexer produces, and the one the
 * serializer knows how to prefix with `> `.
 */
export function buildQuote(run: readonly XmlElement[]) {
	return (parent: Node, ctx: MatchContext): void => {
		const quote: Node = { tag: "md:blockquote", data: { phase: "open" }, children: [], parent };
		parent.children.push(quote);
		for (const paragraph of run) {
			const line: Node = {
				tag: "md:lineitem",
				data: { phase: "open" },
				children: [],
				parent: quote,
			};
			quote.children.push(line);
			ctx.crawlChildren(line, paragraph);
		}
	};
}
