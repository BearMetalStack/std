/**
 * @module
 * `{{…}}` tags for clawmark documents.
 *
 * ```ts
 * import { defaultRules, toHtml } from "@bearmetal/clawmark";
 * import { bindQueries, bmqlRules } from "@bearmetal/bmql/clawmark";
 *
 * const rules = [...bmqlRules(data), ...defaultRules()];
 * const html = new Signal.Computed(() => toHtml(source, rules));
 * // after mounting: bindQueries(container, data);
 * ```
 *
 * A tag with a template stage is markup, so it is expanded before lexing (a
 * preparse rule) and its output joins the text around it - template rows
 * under a table header become rows of that table. Any other tag is a value:
 * a `<span data-bmql>` holding its current text, which `bindQueries` keeps
 * live. `\{{` writes a literal `{{`.
 */

import { effect, Signal } from "@bearmetal/app/signals";
import type { AnyRule, Node, PreparseRule, Rule, StagedRule } from "@bearmetal/clawmark";
import { appendLeaf, escapeHtml, textFallback } from "@bearmetal/clawmark/rules/helpers";
import { format, hasTemplate } from "./format.ts";
import { BmqlSyntaxError, parsePipelineAt } from "./parser.ts";
import { computeText } from "./signals.ts";
import type { FormatOptions, Pipeline } from "./types.ts";

/** The node tag a value tag becomes. */
export const VALUE_TAG = "bmql:value";

/** `data` on a `bmql:value` node. */
export interface ValueData {
	/** The pipeline between the braces, as written. */
	query: string;
}

/** Options for the rules and `bindQueries`: evaluation and formatting options, minus `block`. */
export type BmqlRuleOptions = Omit<FormatOptions, "block">;

/** The template, escape and value rules, in that order. Put them before `defaultRules()`. */
export function bmqlRules(root: unknown, options: BmqlRuleOptions = {}): StagedRule[] {
	return [bmqlTemplateRule(root, options), bmqlEscapeRule(), bmqlValueRule(root, options)];
}

/**
 * Expands a tag whose pipeline has a template stage into the markup it
 * produces, before lexing. A tag on a line of its own joins its items with a
 * newline; anywhere else, with `", "`. Tags inside fenced code blocks and
 * inline code spans are left alone.
 *
 * Run inside a `Signal.Computed`, expansion subscribes to what the template
 * read, so the document re-renders when it changes.
 */
export function bmqlTemplateRule(root: unknown, options: BmqlRuleOptions = {}): PreparseRule {
	return {
		id: "bmql:template",
		stage: "preparse",
		trigger: "{",
		validate(ctx) {
			if (ctx.input[ctx.cursor - 1] === "\\") return false;
			const tag = readTag(ctx.input, ctx.cursor);
			return !!tag && hasTemplate(tag.pipeline) && !insideCode(ctx.input, ctx.cursor);
		},
		expand(ctx) {
			const tag = readTag(ctx.input, ctx.cursor)!;
			const text = ctx.input.slice(ctx.cursor, tag.end);
			const block = ctx.currentLine.trim() === text;
			ctx.cursor = tag.end - 1;
			return format(root, tag.pipeline, { ...options, block });
		},
	};
}

/** `\{{` lexes as a literal `{{`, so a tag can be written about without being run. */
export function bmqlEscapeRule(): AnyRule {
	const rule: Rule = {
		id: "bmql:escape",
		trigger: "\\",
		priority: 1,
		validate: (ctx) => ctx.peek(3) === "\\{{",
		tokenize(ctx) {
			ctx.cursor += 2;
			return textFallback("{{");
		},
		tree: () => {},
		renderOpen: () => "",
	};
	return rule as AnyRule;
}

/**
 * A tag without a template stage becomes a `bmql:value` node holding its
 * current text, and renders as `<span data-bmql="…">text</span>`. Writers that
 * do not know the tag unwrap it, so docx and odt get the text.
 *
 * The text is read untracked: a value changing does not invalidate a
 * `Signal.Computed` the document is rendered in. `bindQueries` updates the
 * span instead.
 *
 * Reading HTML back (`htmlToMarkdown(html, { rules: [bmqlValueRule(data)] })`)
 * restores the tag from the attribute, whatever text the span held.
 */
export function bmqlValueRule(root: unknown, options: BmqlRuleOptions = {}): AnyRule {
	const rule: Rule<ValueData> = {
		id: VALUE_TAG,
		trigger: "{",
		validate(ctx) {
			const tag = readTag(ctx.input, ctx.cursor);
			return !!tag && !hasTemplate(tag.pipeline);
		},
		tokenize(ctx) {
			const tag = readTag(ctx.input, ctx.cursor)!;
			ctx.cursor = tag.end - 1;
			return { tag: VALUE_TAG, data: { query: tag.pipeline.source } };
		},
		tree(token, ctx) {
			const node = appendLeaf(ctx, VALUE_TAG, token.data) as unknown as Node;
			const value = Signal.subtle.untrack(() => format(root, token.data.query, options));
			if (value) {
				node.children.push({ tag: "core:text", data: { value }, children: [], parent: node });
			}
		},
		renderOpen: (node) => `<span data-bmql="${escapeHtml(node.data.query)}">`,
		renderClose: () => "</span>",

		matchTag: "span",
		match(el) {
			const query = el.attrs.get("data-bmql");
			return query === undefined ? null : { kind: "leaf", tag: VALUE_TAG, data: { query } };
		},
		serializeKind: "inline",
		serialize: (node) => `{{${node.data.query}}}`,
	};
	return rule as AnyRule;
}

/**
 * Keeps every `[data-bmql]` element under `container` showing its query's
 * current text, one effect per element. Returns a function that stops them
 * all. Elements whose attribute does not parse are skipped.
 */
export function bindQueries(
	container: ParentNode,
	root: unknown,
	options: BmqlRuleOptions = {},
): () => void {
	const stops: (() => void)[] = [];
	for (const el of container.querySelectorAll("[data-bmql]")) {
		const query = el.getAttribute("data-bmql");
		if (query === null) continue;
		let text: Signal.Computed<string>;
		try {
			text = computeText(root, query, options);
		} catch (error) {
			if (error instanceof BmqlSyntaxError) continue;
			throw error;
		}
		stops.push(effect(() => {
			el.textContent = text.get();
		}));
	}
	return () => {
		for (const stop of stops) stop();
	};
}

function readTag(input: string, at: number): { pipeline: Pipeline; end: number } | undefined {
	if (!input.startsWith("{{", at)) return undefined;
	try {
		return parsePipelineAt(input, at + 2, "}}");
	} catch (error) {
		if (error instanceof BmqlSyntaxError) return undefined;
		throw error;
	}
}

/**
 * Whether `at` sits inside a fenced code block, or an inline code span on its
 * own line. An approximation: it counts fences and backticks, so a span with
 * a multi-backtick delimiter can confuse it.
 */
function insideCode(input: string, at: number): boolean {
	const lineStart = input.lastIndexOf("\n", at - 1) + 1;
	let fenced = false;
	for (const line of input.slice(0, lineStart).split("\n")) {
		const trimmed = line.trimStart();
		if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) fenced = !fenced;
	}
	if (fenced) return true;
	const before = input.slice(lineStart, at);
	return (before.match(/`/g)?.length ?? 0) % 2 === 1;
}
