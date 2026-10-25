/**
 * Turns a clawmark tree into gutenbearg's blocks.
 *
 * Constructs the blocks know — headings, `:::` containers, fenced code, tables, `[[terms]]`,
 * `<Badge/>` — become those components. Everything else goes through the rule's own HTML: a
 * wrapper's opening tag becomes a real element holding this walker's output for its children, so
 * a term inside bold text is still a term, and a leaf is inserted as markup.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Fragment } from "@bearmetal/jsx/jsx-runtime";
import { type AnyRule, isBlockTag, type Node } from "@bearmetal/clawmark";
import {
	COMPONENT_TAG,
	CONTAINER_TAG,
	CONTAINER_TITLE_TAG,
	WIKILINK_TAG,
} from "@bearmetal/clawmark/rules/extra";
import type { CalloutType } from "../blocks/mod.tsx";
import {
	Badge,
	Callout,
	Code,
	CodeGroup,
	Diagram,
	type Feature,
	Features,
	Heading,
	Signature,
	Step,
	Steps,
	Table,
	Term,
} from "../blocks/mod.tsx";
import type { GlossaryEntry, IconName, Tone } from "../types.ts";

/** What rendering needs from the rest of the site. */
export interface RenderEnv {
	/** Clawmark's parse rules, for the HTML fallback. */
	rules: Map<string, AnyRule>;
	/** Maps a link as written (`../0016-reference/0000-signal.md`) to an href, or `undefined` when it leads nowhere. */
	resolveLink(href: string): string | undefined;
	glossary: Record<string, GlossaryEntry>;
	/** Prefix for the source links of `signature` blocks; the block's `[label]` is appended. */
	sourceBase?: string;
}

const CALLOUTS: Record<string, CalloutType> = {
	tip: "tip",
	info: "info",
	note: "info",
	warning: "warning",
	caution: "warning",
	danger: "danger",
};

const TONES = new Set<Tone>(["success", "info", "warn", "danger", "brand", "neutral"]);

type Data = Record<string, unknown>;

/** Renders a tree's children as a fragment. */
export function renderTree(root: Node, env: RenderEnv): JSX.Element {
	return Fragment({ children: renderChildren(root, env) });
}

function renderChildren(node: Node, env: RenderEnv): JSX.Child[] {
	return blocksOf(node.children).map((c) => renderNode(c, env));
}

/** Plain text of a node and its descendants. */
export function plainText(node: Node): string {
	if (node.tag === "core:text") return String((node.data as Data).value ?? "");
	const value = (node.data as Data).value;
	if (typeof value === "string" && !node.children.length) return value;
	return node.children.map(plainText).join("");
}

function renderNode(node: Node, env: RenderEnv): JSX.Child {
	const data = node.data as Data;
	switch (node.tag) {
		case "core:text":
			return String(data.value ?? "");
		case "md:heading": {
			const level = Number(data.level ?? 2);
			const text = plainText(node).trim();
			if (level === 2 || level === 3) {
				return (
					<Heading level={level} id={data.id as string | undefined} text={text}>
						{renderChildren(node, env)}
					</Heading>
				);
			}
			return fallback(node, env);
		}
		case "md:link": {
			const href = String(data.href ?? "");
			const a = document.createElement("a");
			a.setAttribute("href", env.resolveLink(href) ?? href);
			if (data.title) a.setAttribute("title", String(data.title));
			a.append(...toNodes(renderChildren(node, env)));
			return a;
		}
		case "md:codeblock":
			return code(data, env);
		case "md:table":
			return table(node, env);
		case CONTAINER_TAG:
			return container(node, env);
		case WIKILINK_TAG: {
			const target = String(data.target);
			const label = (data.label as string | undefined) ?? target;
			if (env.glossary[target]) return <Term id={target}>{label}</Term>;
			const href = env.resolveLink(target);
			if (href) return <a href={href}>{label}</a>;
			return <span class="gb-wikilink-missing">{label}</span>;
		}
		case COMPONENT_TAG: {
			const props = data.props as Record<string, string>;
			if (data.name === "Badge") {
				const tone = TONES.has(props.type as Tone) ? props.type as Tone : "neutral";
				return <Badge tone={tone}>{props.text ?? ""}</Badge>;
			}
			return fallback(node, env);
		}
		default:
			return fallback(node, env);
	}
}

function code(data: Data, env: RenderEnv): JSX.Element {
	const value = String(data.value ?? "");
	const lang = data.lang as string | undefined;
	const label = data.label as string | undefined;
	if (lang === "diagram") return <Diagram chains={value} />;
	if (lang === "signature") {
		return (
			<Signature
				code={value}
				source={label}
				href={env.sourceBase && label ? env.sourceBase + label : undefined}
			/>
		);
	}
	return <Code code={value} lang={lang} label={label} />;
}

function table(node: Node, env: RenderEnv): JSX.Element {
	const rows = node.children.filter((c) => c.tag === "md:tablerow");
	const cells = (row: Node) =>
		row.children.filter((c) => c.tag === "md:tablecell").map((c) => renderChildren(c, env));
	const [head, ...body] = rows;
	return (
		<Table
			head={head ? head.children.filter((c) => c.tag === "md:tablecell").map(plainText) : []}
			rows={body.map(cells)}
		/>
	);
}

function container(node: Node, env: RenderEnv): JSX.Child {
	const { kind } = node.data as { kind: string };
	const [first, ...rest] = node.children;
	const titled = first?.tag === CONTAINER_TITLE_TAG;
	const body = titled ? rest : node.children;
	const title = titled ? renderChildren(first, env) : undefined;

	const callout = CALLOUTS[kind];
	if (callout) {
		return (
			<Callout type={callout} title={title}>
				{blocksOf(body).map((c) => renderNode(c, env))}
			</Callout>
		);
	}
	if (kind === "steps") return steps(body, env);
	if (kind === "code-group") {
		const tabs = blocksOf(body).filter((c) => c.tag === "md:codeblock").map((c) => {
			const d = c.data as Data;
			return {
				code: String(d.value ?? ""),
				lang: d.lang as string | undefined,
				label: d.label as string | undefined,
			};
		});
		return <CodeGroup tabs={tabs} />;
	}
	if (kind === "features") return features(body, env);
	return (
		<div class={`gb-container ${kind}`}>
			{title && <p class="gb-container-title">{title}</p>}
			{blocksOf(body).map((c) => renderNode(c, env))}
		</div>
	);
}

/**
 * Children with paragraphs split at the blocks inside them. Clawmark keeps lines without a blank
 * line between them in one paragraph, so `### Step` and the code under it can arrive as one
 * `core:paragraph`; here each block stands alone and each run of inline content between them
 * becomes its own paragraph. Whitespace-only runs are dropped.
 */
function blocksOf(nodes: Node[]): Node[] {
	const out: Node[] = [];
	for (const node of nodes) {
		if (node.tag !== "core:paragraph") {
			out.push(node);
			continue;
		}
		let run: Node[] = [];
		const flush = () => {
			while (run.length && isBlank(run[0])) run.shift();
			while (run.length && isBlank(run[run.length - 1])) run.pop();
			if (run.length) out.push({ ...node, children: run });
			run = [];
		};
		for (const child of node.children) {
			if (isBlockTag(child.tag)) {
				flush();
				out.push(child);
			} else run.push(child);
		}
		flush();
	}
	return out;
}

function isBlank(node: Node): boolean {
	return node.tag === "core:text" && !String((node.data as Data).value ?? "").trim();
}

/** `::: steps` — each `###` heading starts a step and owns the blocks under it. */
function steps(body: Node[], env: RenderEnv): JSX.Element {
	const groups: { heading: Node; rest: Node[] }[] = [];
	for (const node of blocksOf(body)) {
		if (node.tag === "md:heading") groups.push({ heading: node, rest: [] });
		else groups.at(-1)?.rest.push(node);
	}
	return (
		<Steps>
			{groups.map((g) => (
				<Step
					title={plainText(g.heading).trim()}
					id={(g.heading.data as Data).id as string | undefined}
				>
					{g.rest.map((n) => renderNode(n, env))}
				</Step>
			))}
		</Steps>
	);
}

/** `::: features` — a list whose items read `icon | title | text`, where only the text may carry markup. */
function features(body: Node[], env: RenderEnv): JSX.Element {
	const list = blocksOf(body).find((n) => n.tag === "md:unorderedlist");
	const items: Feature[] = (list?.children ?? []).map((item) => {
		const [icon = [], title = [], text = []] = splitOnPipes(item);
		const name = icon.map(plainText).join("").trim();
		return {
			icon: (name || "lightning") as IconName,
			title: title.map(plainText).join("").trim(),
			text: text.map((n) => renderNode(n, env)),
		};
	});
	return <Features items={items} />;
}

/** An item's inline content cut at its first two `|`s, paragraphs looked through. */
function splitOnPipes(item: Node): Node[][] {
	const inline = item.children.flatMap((c) => (c.tag === "core:paragraph" ? c.children : [c]));
	const segs: Node[][] = [[]];
	for (const node of inline) {
		if (node.tag !== "core:text" || segs.length === 3) {
			segs.at(-1)!.push(node);
			continue;
		}
		const value = String((node.data as Data).value ?? "");
		const parts = value.split("|");
		const cut = Math.min(parts.length - 1, 3 - segs.length);
		parts.slice(0, cut + 1).forEach((part, i) => {
			if (i > 0) segs.push([]);
			if (part.trim()) segs.at(-1)!.push(textNode(i > 0 ? part.trimStart() : part));
		});
		const remainder = parts.slice(cut + 1).join("|");
		if (cut < parts.length - 1) segs.at(-1)!.push(textNode(`|${remainder}`));
	}
	return segs;
}

function textNode(value: string): Node {
	return { tag: "core:text", data: { value }, children: [] };
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

const OPEN_TAG = /^<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*>$/;

/**
 * A node no block claims, through its rule's own HTML. A wrapper whose opening tag is a single
 * element keeps walking its children here; anything else (a leaf, or markup the rule writes in
 * one piece) is inserted as raw HTML.
 */
function fallback(node: Node, env: RenderEnv): JSX.Child {
	const rule = env.rules.get(node.tag);
	if (!rule) return Fragment({ children: renderChildren(node, env) });
	const ctx = { renderMethod: "html" as const };
	const open = rule.renderOpen(node, ctx);
	if (open === "") return Fragment({ children: renderChildren(node, env) });
	const m = OPEN_TAG.exec(open);
	if (m && node.children.length) {
		const el = document.createElement(m[1]);
		for (const a of m[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
			el.setAttribute(a[1], decode(a[2] ?? ""));
		}
		el.append(...toNodes(renderChildren(node, env)));
		return el;
	}
	const html = open + renderHtml(node.children, env) + (rule.renderClose?.(node, ctx) ?? "");
	return Fragment({ children: html, $raw: true });
}

function renderHtml(nodes: Node[], env: RenderEnv): string {
	return nodes.map((n) => {
		if (n.tag === "core:text") {
			return String((n.data as Data).value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;");
		}
		const rule = env.rules.get(n.tag);
		if (!rule) return renderHtml(n.children, env);
		const ctx = { renderMethod: "html" as const };
		return rule.renderOpen(n, ctx) + renderHtml(n.children, env) +
			(rule.renderClose?.(n, ctx) ?? "");
	}).join("");
}

function decode(value: string): string {
	return value.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function toNodes(children: JSX.Child[]): (globalThis.Node | string)[] {
	return children.flatMap((c): (globalThis.Node | string)[] => {
		if (c === null || c === undefined || c === false || c === true) return [];
		if (typeof c === "string" || typeof c === "number") return [String(c)];
		return [c as unknown as globalThis.Node];
	});
}
