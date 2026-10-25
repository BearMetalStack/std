/**
 * Documentation-site syntax: `:::` containers, `[[wiki links]]`, generated heading ids, and
 * self-closing inline components (`<Badge type="warn" text="new"/>`). The spellings follow
 * VitePress, so content written for it parses unchanged.
 */

import type {
	AnyPostparseRule,
	AnyRule,
	LexerContext,
	Node,
	PostparseRule,
	Rule,
	TokenIdentifier,
} from "../../types.ts";
import { Lexer } from "../../lexer.ts";
import { TreeBuilder } from "../../tree.ts";
import { appendLeaf, escapeHtml, inlineOnly, parseInline } from "../helpers.ts";
import { addBlockTags } from "../paragraph.ts";

/** Up to `length` characters from the cursor; `peek` returns "eof" when the input is shorter. */
function ahead(ctx: LexerContext, length: number): string {
	return ctx.input.slice(ctx.cursor, ctx.cursor + length);
}

// ---- containers -----------------------------------------------------------

/** A `::: kind title` block. Its first child is the title when there is one. */
export const CONTAINER_TAG: TokenIdentifier = "x:container";
/** The inline title of a container, always its first child. */
export const CONTAINER_TITLE_TAG: TokenIdentifier = "x:containertitle";

/** `data` on an `x:container` node. */
export type ContainerData = {
	kind: string;
	/** The title as plain text; the parsed title is the {@linkcode CONTAINER_TITLE_TAG} child. */
	title: string;
};

type ContainerToken = ContainerData & { titleNodes: Node[]; body: Node[] };

const OPENER = /^:::[ \t]*([A-Za-z][\w-]*)[ \t]*(.*?)[ \t]*$/;
const CLOSER = /^:::[ \t]*$/;
const FENCE = /^(`{3,}|~{3,})/;

/**
 * Where the container opened on the current line closes: the offset of the last character of its
 * closing `:::` line, and the source between. Nested openers need their own closer, and lines
 * inside fenced code are never read as either. An unclosed container runs to the end of input.
 */
function scanContainer(ctx: LexerContext): { inner: string; end: number } {
	const input = ctx.input;
	let pos = input.indexOf("\n", ctx.lineStart);
	if (pos < 0) return { inner: "", end: input.length - 1 };
	const start = pos + 1;
	let depth = 1;
	let fence: string | null = null;
	while (pos < input.length) {
		const lineStart = pos + 1;
		let lineEnd = input.indexOf("\n", lineStart);
		if (lineEnd < 0) lineEnd = input.length;
		const line = input.slice(lineStart, lineEnd);
		const f = FENCE.exec(line.trimStart());
		if (fence) {
			if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
		} else if (f) fence = f[1];
		else if (OPENER.test(line)) depth++;
		else if (CLOSER.test(line) && --depth === 0) {
			return { inner: input.slice(start, Math.max(start, lineStart - 1)), end: lineEnd - 1 };
		}
		if (lineEnd >= input.length) break;
		pos = lineEnd;
	}
	return { inner: input.slice(start), end: input.length - 1 };
}

function parseBlocks(source: string, rules: readonly AnyRule[]): Node[] {
	if (!source.trim()) return [];
	const pool = rules as AnyRule[];
	return new TreeBuilder(pool).build(new Lexer(source, pool).tokenize()).children;
}

function adopt(parent: Node, children: Node[]): void {
	parent.children = children;
	for (const child of children) child.parent = parent;
}

/**
 * `::: kind optional title` … `:::`, nestable, any kind. Renderers decide what a kind means; HTML
 * gets `<div class="container kind">`. The body is parsed as blocks with the full rule set, so a
 * container can hold lists, code, tables and other containers.
 */
export function containerRules(): AnyRule[] {
	addBlockTags(CONTAINER_TAG);

	const container: Rule<ContainerToken> = {
		id: CONTAINER_TAG,
		trigger: ":",
		validate: (ctx) => ctx.cursor === ctx.lineStart && OPENER.test(ctx.currentLine),
		tokenize(ctx) {
			const [, kind, title] = OPENER.exec(ctx.currentLine)!;
			const { inner, end } = scanContainer(ctx);
			ctx.cursor = end;
			return {
				tag: CONTAINER_TAG,
				data: {
					kind,
					title,
					titleNodes: parseInline(title, inlineOnly(ctx.rules)),
					body: parseBlocks(inner, ctx.rules),
				},
			};
		},
		tree(token, ctx) {
			const { kind, title, titleNodes, body } = token.data;
			const node = appendLeaf(ctx, CONTAINER_TAG, { kind, title } as ContainerToken);
			const children = [...body];
			if (titleNodes.length) {
				const head: Node = { tag: CONTAINER_TITLE_TAG, data: {}, children: [] };
				adopt(head, titleNodes);
				children.unshift(head);
			}
			adopt(node as unknown as Node, children);
		},
		renderOpen: (node) =>
			`<div class="container ${escapeHtml((node.data as ContainerData).kind)}">`,
		renderClose: () => "</div>",
		matchTag: "div",
		match: (el) => {
			const classes = (el.attrs.get("class") ?? "").split(/\s+/);
			if (!classes.includes("container")) return null;
			const kind = classes.find((c) => c && c !== "container") ?? "note";
			return { kind: "wrap", tag: CONTAINER_TAG, data: { kind, title: "" } };
		},
		serializeKind: "block",
		serialize(node, ctx) {
			const { kind } = node.data as ContainerData;
			const [first, ...rest] = node.children;
			const hasTitle = first?.tag === CONTAINER_TITLE_TAG;
			const title = hasTitle ? ctx.children(first) : "";
			const body = ctx.children({
				...(node as unknown as Node),
				children: hasTitle ? rest : node.children,
			});
			return `::: ${kind}${title ? ` ${title}` : ""}\n${body}${body ? "\n" : ""}:::`;
		},
	};

	const title: Rule = {
		id: CONTAINER_TITLE_TAG,
		trigger: ":",
		validate: () => false,
		tokenize: () => ({ tag: CONTAINER_TITLE_TAG, data: {} }),
		tree: (token, ctx) => appendLeaf(ctx, CONTAINER_TITLE_TAG, token.data),
		renderOpen: () => `<p class="container-title">`,
		renderClose: () => "</p>",
		matchTag: "p",
		match: (el, ctx) =>
			ctx.parentTag === CONTAINER_TAG &&
				(el.attrs.get("class") ?? "").split(/\s+/).includes("container-title")
				? { kind: "wrap", tag: CONTAINER_TITLE_TAG, data: {} }
				: null,
		serializeKind: "inline",
		serialize: (node, ctx) => ctx.children(node),
	};

	return [container as AnyRule, title as AnyRule];
}

// ---- wiki links -----------------------------------------------------------

/** A `[[target]]` or `[[target|label]]` reference. */
export const WIKILINK_TAG: TokenIdentifier = "x:wikilink";

/** `data` on an `x:wikilink` node. */
export interface WikiLinkData {
	target: string;
	/** Omitted when the source gave none; renderers fall back to the target. */
	label?: string;
}

/**
 * `[[target]]` and `[[target|label]]`. What a target names (a glossary term, a page) is the
 * renderer's business; HTML gets `<span class="wikilink" data-target>`. Takes priority over the
 * link and table-of-contents rules, which share the `[` trigger.
 */
export function wikiLinkRule(): AnyRule {
	const rule: Rule<WikiLinkData> = {
		id: WIKILINK_TAG,
		trigger: "[",
		priority: 2,
		validate: (ctx) => /^\[\[[^\]\n|]+(\|[^\]\n]*)?\]\]/.test(ahead(ctx, 256)),
		tokenize(ctx) {
			const m = /^\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/.exec(ahead(ctx, 256))!;
			ctx.cursor += m[0].length - 1;
			const data: WikiLinkData = { target: m[1].trim() };
			if (m[2] !== undefined) data.label = m[2].trim();
			return { tag: WIKILINK_TAG, data };
		},
		tree: (token, ctx) => appendLeaf(ctx, WIKILINK_TAG, token.data),
		renderOpen: (node) =>
			`<span class="wikilink" data-target="${escapeHtml(node.data.target)}">${
				escapeHtml(node.data.label ?? node.data.target)
			}</span>`,
		matchTag: "span",
		match: (el) => {
			if (!(el.attrs.get("class") ?? "").split(/\s+/).includes("wikilink")) return null;
			const target = el.attrs.get("data-target");
			if (!target) return null;
			const label = el.children.map((c) => ("text" in c ? c.text : "")).join("");
			return {
				kind: "leaf",
				tag: WIKILINK_TAG,
				data: label && label !== target ? { target, label } : { target },
			};
		},
		serializeKind: "inline",
		serialize: (node) =>
			node.data.label !== undefined
				? `[[${node.data.target}|${node.data.label}]]`
				: `[[${node.data.target}]]`,
	};
	return rule as AnyRule;
}

// ---- heading ids ----------------------------------------------------------

/** The default heading slug: lowercase, punctuation dropped, words joined by `-`. */
export function slugifyHeading(text: string): string {
	return text.toLowerCase().replace(/[`*()]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(
		/^-|-$/g,
		"",
	);
}

function plainText(node: Node): string {
	if (node.tag === "core:text") return String((node.data as { value?: unknown }).value ?? "");
	const value = (node.data as { value?: unknown }).value;
	if (typeof value === "string" && !node.children.length) return value;
	return node.children.map(plainText).join("");
}

/**
 * Gives every heading an `id` from its text, so anchors and tables of contents have something to
 * point at. Repeats get `-1`, `-2`… in document order, and an `id` already on a heading is kept.
 * The heading rule renders it as an `id` attribute.
 */
export function headingIdsRule(
	options: { slugify?: (text: string) => string } = {},
): AnyPostparseRule {
	const slugify = options.slugify ?? slugifyHeading;
	const seen = new WeakMap<Node, Map<string, number>>();
	const rule: PostparseRule<{ id?: string }> = {
		id: "x:headingids",
		stage: "postparse",
		visit: "md:heading",
		transform(node, ctx) {
			let used = seen.get(ctx.root);
			if (!used) seen.set(ctx.root, used = new Map());
			const base = node.data.id ?? (slugify(plainText(node)) || "section");
			const n = used.get(base) ?? 0;
			used.set(base, n + 1);
			node.data.id = n ? `${base}-${n}` : base;
		},
	};
	return rule;
}

// ---- inline components ----------------------------------------------------

/** A self-closing `<Name prop="value"/>` in running text. */
export const COMPONENT_TAG: TokenIdentifier = "x:component";

/** `data` on an `x:component` node. */
export interface ComponentData {
	name: string;
	props: Record<string, string>;
}

const COMPONENT = /^<([A-Z][\w]*)((?:\s+[A-Za-z_][\w-]*="[^"\n]*")*)\s*\/>/;

/**
 * Self-closing, capitalized tags with string props — `<Badge type="warn" text="new"/>` — as
 * nodes rather than raw HTML, so a renderer can map them onto real components. Lowercase tags are
 * never matched. Limit the accepted names with `names`.
 */
export function inlineComponentRule(options: { names?: string[] } = {}): AnyRule {
	const allowed = options.names && new Set(options.names);
	const read = (ctx: LexerContext) => {
		const m = COMPONENT.exec(ahead(ctx, 512));
		return m && (!allowed || allowed.has(m[1])) ? m : null;
	};
	const rule: Rule<ComponentData> = {
		id: COMPONENT_TAG,
		trigger: "<",
		priority: 1,
		validate: (ctx) => read(ctx) !== null,
		tokenize(ctx) {
			const m = read(ctx)!;
			ctx.cursor += m[0].length - 1;
			const props: Record<string, string> = {};
			for (const p of m[2].matchAll(/([A-Za-z_][\w-]*)="([^"\n]*)"/g)) props[p[1]] = p[2];
			return { tag: COMPONENT_TAG, data: { name: m[1], props } };
		},
		tree: (token, ctx) => appendLeaf(ctx, COMPONENT_TAG, token.data),
		renderOpen: (node) => {
			const attrs = Object.entries(node.data.props)
				.map(([k, v]) => ` data-${escapeHtml(k)}="${escapeHtml(v)}"`).join("");
			return `<span data-component="${escapeHtml(node.data.name)}"${attrs}>${
				escapeHtml(node.data.props.text ?? "")
			}</span>`;
		},
		serializeKind: "inline",
		serialize: (node) =>
			`<${node.data.name}${
				Object.entries(node.data.props).map(([k, v]) => ` ${k}="${v}"`).join("")
			}/>`,
	};
	return rule as AnyRule;
}

/** Every rule in this file: containers, wiki links, inline components and heading ids. */
export function docsRules(): (AnyRule | AnyPostparseRule)[] {
	return [...containerRules(), wikiLinkRule(), inlineComponentRule(), headingIdsRule()];
}
