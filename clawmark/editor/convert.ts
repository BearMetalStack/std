import { fromHtml, toHtml, toMarkdown } from "../mod.ts";
import { htmlProfile } from "../profiles/html/mod.ts";
import { defaultRules } from "../rules/mod.ts";
import { type AnyReverseRule, ruleStage, type StagedRule } from "../types.ts";
import { parseHtml, serializeXml } from "../xml/mod.ts";
import type { XmlElement, XmlNode } from "../xml/types.ts";

const FORBIDDEN = new Set([
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"link",
	"meta",
	"base",
	"form",
]);
const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction"]);
const UNSAFE_URL = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)/i;

function clean(node: XmlElement): void {
	node.children = node.children.filter((child): child is XmlNode => {
		if (child.kind !== "element") return true;
		return !FORBIDDEN.has(child.name);
	});
	for (const child of node.children) {
		if (child.kind !== "element") continue;
		for (const [name, value] of [...child.attrs]) {
			const lower = name.toLowerCase();
			// Control characters are ignored by URL parsers, so strip them before testing.
			// deno-lint-ignore no-control-regex
			const url = value.replace(/[\u0000-\u001f\u007f]/g, "");
			if (lower.startsWith("on") || (URL_ATTRS.has(lower) && UNSAFE_URL.test(url))) {
				child.attrs.delete(name);
			}
		}
		clean(child);
	}
}

/**
 * Strips what could execute from `html` before it is placed in an editable
 * surface: scripts, frames, embeds, `on*` handlers and script-bearing URLs.
 * `md:raw` and the docs rules can legitimately emit arbitrary markup, and the
 * rich view inserts HTML, so this is not optional.
 */
export function sanitizeHtml(html: string): string {
	const root = parseHtml(html);
	clean(root);
	return root.children.map((child) => serializeXml(child, "html")).join("");
}

/** Markdown to the HTML the rich view edits: the forward render, sanitized. */
export function markdownToRich(markdown: string, rules: StagedRule[]): string {
	return sanitizeHtml(toHtml(markdown, rules));
}

/**
 * The editable surface (or HTML source) back to markdown, using the editor's
 * own rules in both directions so a custom rule reverses the same way it
 * rendered. The html profile contributes the contenteditable handling (filler
 * `<br>`s, CSS-only formatting) that a bare rule set would lack.
 */
export function richToMarkdown(
	source: string | Element | DocumentFragment,
	rules: StagedRule[],
): string {
	const builtIn = new Set(defaultRules().map((r) => r.id));
	const custom = rules.filter((r) =>
		ruleStage(r) === "parse" && !builtIn.has(r.id)
	) as AnyReverseRule[];
	const options = { rules: custom };
	const tree = fromHtml(source, options);
	// Editor rules last: the serializer keys on id, so they win over the profile's copies.
	return toMarkdown(tree, [...htmlProfile(options).rules, ...rules]);
}
