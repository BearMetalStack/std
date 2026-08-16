/**
 * @module
 * The HTML profile.
 *
 * Unlike the docx and odt profiles, this one is not really a separate body of
 * knowledge: HTML is clawmark's *own* output format, so the matchers live on
 * the rules themselves in `rules/*.ts` and `fromHtml` is the true inverse of
 * `toHtml`. What this module adds is the style resolver (which exists mainly
 * to survive pasted-from-Word HTML) and the structural elements markdown has
 * no equivalent for.
 */

import type { AnyReverseRule, Profile } from "../../types.ts";
import { defaultRules } from "../../rules/mod.ts";
import { htmlStyleResolver } from "./styles.ts";
import type { HtmlStyleOptions } from "./styles.ts";

export { htmlStyleResolver, parseInlineStyle } from "./styles.ts";
export type { HtmlStyleOptions } from "./styles.ts";
export { htmlWriter } from "./write.ts";
export type { HtmlWriteOptions } from "./write.ts";

/**
 * Elements that carry no markdown meaning but whose *children* do. Dropping
 * them outright would lose content; keeping them would produce raw HTML for
 * what is really just layout.
 */
const TRANSPARENT = [
	"html",
	"body",
	"main",
	"article",
	"section",
	"div",
	"span",
	"header",
	"footer",
	"nav",
	"figure",
	"figcaption",
	"tbody",
	"thead",
	"tfoot",
	"colgroup",
	"font",
	"small",
	"big",
	"u",
	"ins",
	"abbr",
	"cite",
	"q",
	"time",
	"label",
];

/** Elements whose entire subtree is noise in a markdown context. */
const DROPPED = ["head", "script", "style", "meta", "link", "title", "base", "col", "noscript"];

function transparentRule(tag: string): AnyReverseRule {
	return {
		id: `rev:unwrap-${tag}`,
		matchTag: tag,
		match: () => ({ kind: "unwrap" }),
	};
}

function dropRule(tag: string): AnyReverseRule {
	return {
		id: `rev:drop-${tag}`,
		matchTag: tag,
		match: () => ({ kind: "drop" }),
	};
}

export interface HtmlProfileOptions extends HtmlStyleOptions {
	/** Extra rules, consulted *before* the built-ins. */
	rules?: AnyReverseRule[];
	/** What to do with an element no rule claimed. Default "unwrap". */
	unmatched?: Profile["unmatched"];
	/** Per-element-name overrides of `unmatched`. */
	unmatchedByTag?: Profile["unmatchedByTag"];
	/**
	 * Parse strictness for the source markup. `"html"` (the default) is
	 * tolerant: void/raw-text elements and the implicit-close table are
	 * honored, names fold to lowercase, and unquoted attributes and stray `<`
	 * are recovered from rather than rejected - what real-world "HTML-ish"
	 * input, including Word's export and clawmark's own `htmlWriter` output,
	 * actually needs.
	 *
	 * `"xhtml"` parses strictly as XML instead: malformed markup surfaces as a
	 * recoverable error rather than being silently patched over, and `xmlns`
	 * is resolved. Well-formed input reverses to the same markdown either
	 * way - this only matters to a caller who wants strictness enforced on
	 * genuinely XHTML source rather than assumed away.
	 */
	input?: "html" | "xhtml";
}

/** A profile that turns clawmark's own HTML output - and ordinary HTML - back into markdown. */
export function htmlProfile(options: HtmlProfileOptions = {}): Profile {
	return {
		name: "html",
		parse: { mode: options.input === "xhtml" ? "xml" : "html" },
		styles: htmlStyleResolver(options),
		// Order is precedence. Caller rules first, then the real constructs,
		// then the structural fallbacks - so a <span class="highlight"> is
		// claimed by highlightRule before the blanket span unwrap sees it.
		rules: [
			...(options.rules ?? []),
			...defaultRules(),
			...DROPPED.map(dropRule),
			...TRANSPARENT.map(transparentRule),
		],
		unmatched: options.unmatched ?? "unwrap",
		unmatchedByTag: options.unmatchedByTag,
	};
}
