/**
 * @module
 * The content vocabulary a page body is written in.
 *
 * Each block is the rendering target for one markdown construct — `## heading`, `::: tip`,
 * `::: steps`, `::: code-group`, a fenced `signature` or `diagram`, a pipe table, `[[term]]`. Until
 * content is read from markdown, pages compose them directly; afterwards the markdown rules emit
 * them, and the templates and stylesheet do not change.
 *
 * Plain `<p>`, `<ul>`, `<ol>` and `<code>` need no wrapper — {@linkcode Prose} styles them.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { IconName } from "../types.ts";
import { slugify } from "../site.ts";
import { highlight } from "./highlight.tsx";
import { Icon } from "./icon.tsx";

export { Badge, Icon, ICON_SHEET } from "./icon.tsx";
export { highlight } from "./highlight.tsx";

/** The typeset column every body renders inside. */
export function Prose(
	{ children, class: className }: { children?: JSX.Children; class?: string },
): JSX.Element {
	return <div class={className ? `gb-prose ${className}` : "gb-prose"}>{children}</div>;
}

// ─── Headings ─────────────────────────────────────────────────────────────────

/**
 * A section heading with a hover anchor. Level 2 headings are what the table of contents, page
 * map and trail list; `id` defaults to the slugged text.
 */
export function Heading(
	{ level = 2, id, children }: { level?: 2 | 3; id?: string; children: string },
): JSX.Element {
	const anchor = id ?? slugify(children);
	const body = (
		<>
			{children}
			<a class="gb-anchor" href={`#${anchor}`} aria-label="Link to section">#</a>
		</>
	);
	return level === 2
		? <h2 id={anchor} data-text={children}>{body}</h2>
		: <h3 id={anchor} data-text={children}>{body}</h3>;
}

/** `## text` */
export const H2 = ({ id, children }: { id?: string; children: string }): JSX.Element => (
	<Heading level={2} id={id}>{children}</Heading>
);

/** `### text` */
export const H3 = ({ id, children }: { id?: string; children: string }): JSX.Element => (
	<Heading level={3} id={id}>{children}</Heading>
);

// ─── Callouts ─────────────────────────────────────────────────────────────────

/** The four `:::` callout kinds. */
export type CalloutType = "tip" | "info" | "warning" | "danger";

const CALLOUTS: Record<CalloutType, [IconName, string]> = {
	tip: ["lightbulb-fill", "Tip"],
	info: ["info-fill", "Note"],
	warning: ["warning-fill", "Warning"],
	danger: ["fire-fill", "Danger"],
};

/** `::: tip Title` … `:::` */
export function Callout(
	{ type, title, children }: { type: CalloutType; title?: JSX.Children; children?: JSX.Children },
): JSX.Element {
	const [icon, fallback] = CALLOUTS[type];
	return (
		<aside class={`gb-callout sq ${type}`} data-kind={`callout-${type}`}>
			<div class="gb-callout-h">
				<Icon name={icon} />
				{title ?? fallback}
			</div>
			<div class="gb-callout-b">{children}</div>
		</aside>
	);
}

// ─── Steps ────────────────────────────────────────────────────────────────────

/** `::: steps` — a numbered sequence of {@linkcode Step}s. */
export function Steps({ children }: { children?: JSX.Children }): JSX.Element {
	return <ol class="gb-steps" data-kind="steps">{children}</ol>;
}

/** One `### heading` and the blocks under it inside `::: steps`. */
export function Step(
	{ title, id, children }: { title: string; id?: string; children?: JSX.Children },
): JSX.Element {
	return (
		<li>
			<span class="gb-step-n" aria-hidden="true"></span>
			<div>
				<h3 id={id ?? slugify(title)} data-text={title}>{title}</h3>
				{children}
			</div>
		</li>
	);
}

// ─── Code ─────────────────────────────────────────────────────────────────────

/** A fenced code block: `lang [file]`. */
export interface CodeSource {
	code: string;
	lang?: string;
	/** Shown as a file name above the code, and as the tab label inside a group. */
	label?: string;
}

function CopyButton(): JSX.Element {
	return (
		<button type="button" class="gb-copy" aria-label="Copy code" data-gb-copy>
			<Icon name="copy" />
			<span></span>
		</button>
	);
}

/** ```` ```lang [label] ```` */
export function Code({ code, lang, label }: CodeSource): JSX.Element {
	return (
		<div class="gb-code sq" data-kind="code">
			{label && (
				<div class="gb-code-head">
					<span class="gb-file">
						<Icon name="file-code" />
						{label}
					</span>
				</div>
			)}
			<CopyButton />
			<pre><code>{highlight(code, lang)}</code></pre>
		</div>
	);
}

/**
 * `::: code-group` — tabbed alternatives (package managers, runtimes). The reader's pick is
 * remembered by label and applied to every group on every page that offers it.
 */
export function CodeGroup({ tabs }: { tabs: CodeSource[] }): JSX.Element {
	const labels = tabs.map((t) => t.label ?? t.lang ?? "code");
	return (
		<div class="gb-code sq" data-kind="code" data-gb-group>
			<div class="gb-code-head" role="tablist">
				{labels.map((label, i) => (
					<button
						type="button"
						role="tab"
						class={i === 0 ? "on" : ""}
						aria-selected={i === 0 ? "true" : "false"}
						data-gb-tab={label}
					>
						{label}
					</button>
				))}
				<span class="gb-code-hint">remembered across pages</span>
			</div>
			<CopyButton />
			{tabs.map((t, i) => (
				<pre
					data-gb-pane={labels[i]}
					hidden={i !== 0}
				><code>{highlight(t.code, t.lang)}</code></pre>
			))}
		</div>
	);
}

/** ```` ```signature ```` — the declaration a reference page documents. */
export function Signature(
	{ code, source, href }: { code: string; source?: string; href?: string },
): JSX.Element {
	return (
		<div class="gb-sig sq" data-kind="code">
			<div class="gb-sig-head">
				<span>Signature</span>
				{source && (
					<a href={href ?? "#"}>
						<Icon name="github-logo" />
						{source}
					</a>
				)}
				<CopyButton />
			</div>
			<pre><code>{highlight(code, "ts")}</code></pre>
		</div>
	);
}

// ─── Diagram ──────────────────────────────────────────────────────────────────

/**
 * ```` ```diagram ```` — one chain per line, `A -[label]-> B -> C`. The first node of each chain is
 * drawn as its source.
 */
export function Diagram({ chains }: { chains: string }): JSX.Element {
	const rows = chains.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
		const parts = line.split(/\s*-(?:\[([^\]]+)\]-?)?>\s*/);
		const nodes: string[] = [];
		const edges: string[] = [];
		parts.forEach((p, i) => (i % 2 === 0 ? nodes : edges).push(p ?? ""));
		return { nodes, edges };
	});
	return (
		<figure class="gb-diagram sq" data-kind="diagram">
			{rows.map((r) => (
				<div class="gb-dg-row">
					{r.nodes.map((n, i) => (
						<>
							{i > 0 && (
								<span class="gb-dg-edge">
									<em>{r.edges[i - 1]}</em>
									<i></i>
								</span>
							)}
							<span
								class={i === 0 ? "gb-dg-node gradient-border border-ember animate" : "gb-dg-node"}
							>
								{n}
							</span>
						</>
					))}
				</div>
			))}
		</figure>
	);
}

// ─── Tables ───────────────────────────────────────────────────────────────────

/** A pipe table. A first-column `<code>` is coloured as the row's key. */
export function Table(
	{ head, rows }: { head: string[]; rows: JSX.Children[][] },
): JSX.Element {
	return (
		<div class="gb-table sq" data-kind="table">
			<table>
				<thead>
					<tr>{head.map((h) => <th>{h}</th>)}</tr>
				</thead>
				<tbody>
					{rows.map((r) => <tr>{r.map((c) => <td>{c}</td>)}</tr>)}
				</tbody>
			</table>
		</div>
	);
}

// ─── Home ─────────────────────────────────────────────────────────────────────

/** One tile in {@linkcode Features}. */
export interface Feature {
	icon: IconName;
	title: string;
	text: JSX.Children;
}

/** `::: features` — the home page's selling points. */
export function Features({ items }: { items: Feature[] }): JSX.Element {
	return (
		<div class="gb-features">
			{items.map((f) => (
				<div class="gb-feature sq">
					<span class="gb-feature-i gradient ember">
						<Icon name={f.icon} />
					</span>
					<h3>{f.title}</h3>
					<p>{f.text}</p>
				</div>
			))}
		</div>
	);
}

// ─── Inline ───────────────────────────────────────────────────────────────────

/**
 * `[[id]]` or `[[id|label]]` — a glossary term. The page template ships the definitions of every
 * term it finds in the body, so the popover needs nothing from the block itself.
 */
export function Term({ id, children }: { id: string; children?: JSX.Children }): JSX.Element {
	return <span class="gb-term" data-term={id} tabindex={0}>{children ?? id}</span>;
}
