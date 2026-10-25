import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { DocContent, Frontmatter, PageContext, ResolvedPage } from "../types.ts";
import { href, prevNext, toneOf } from "../site.ts";
import { Badge, Icon, Prose } from "../blocks/mod.tsx";
import { Document, Shell } from "./document.tsx";
import { measure } from "./measure.ts";

/**
 * Shown when the reader picked an older version: either a reminder, or — when the page's `since`
 * is newer than that version — a warning that the page does not exist there.
 */
export function VersionBanner(
	{ ctx, frontmatter }: { ctx: PageContext; frontmatter: Frontmatter },
): JSX.Element | null {
	const latest = ctx.site.versions[0];
	if (!latest || ctx.version === latest) return null;
	const missing = frontmatter.since !== undefined &&
		compareVersions(frontmatter.since, ctx.version) > 0;
	return (
		<div class={missing ? "gb-verbanner missing sq" : "gb-verbanner sq"}>
			<Icon name="clock-counter-clockwise" />
			<span>
				{missing
					? (
						<>
							This page was added in <b>v{frontmatter.since}</b>{" "}
							and doesn’t exist in v{ctx.version}.
						</>
					)
					: (
						<>
							You’re reading the <b>v{ctx.version}</b>{" "}
							docs. Details may differ from the latest release.
						</>
					)}
			</span>
			<a href={`?v=${latest}`}>Go to v{latest}</a>
		</div>
	);
}

function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return d;
	}
	return 0;
}

/** Eyebrow, title, lede and the status/since/reading-time facts. */
export function PageHeader(
	{ ctx, frontmatter: fm, minutes }: {
		ctx: PageContext;
		frontmatter: Frontmatter;
		minutes: number;
	},
): JSX.Element {
	const sec = ctx.site.nav.find((s) => s.id === ctx.route.split("/")[0]);
	const pkg = ctx.site.packages.find((p) => p.id === fm.package);
	return (
		<header class="gb-pagehead">
			<VersionBanner ctx={ctx} frontmatter={fm} />
			{sec && (
				<div class="gb-eyebrow">
					<Icon name={sec.icon} />
					{sec.label}
					{pkg && (
						<>
							<span>·</span>
							<code>{pkg.name}</code>
						</>
					)}
				</div>
			)}
			<h1>{fm.title}</h1>
			{fm.description && <p class="gb-lede">{fm.description}</p>}
			<div class="gb-facts">
				{fm.status && <Badge tone={toneOf(fm.status)}>{fm.status}</Badge>}
				{fm.since && (
					<span>
						<Icon name="tag" />
						since v{fm.since}
					</span>
				)}
				<span>
					<Icon name="clock" />
					{minutes} min read
				</span>
				{fm.updated && (
					<span>
						<Icon name="calendar-blank" />
						{fm.updated}
					</span>
				)}
			</div>
		</header>
	);
}

/** The end cap and previous/next cards. */
export function PrevNext({ ctx }: { ctx: PageContext }): JSX.Element {
	const { prev, next } = prevNext(ctx.site, ctx.route);
	return (
		<footer class="gb-foot">
			<div class="gb-endcap">
				<Icon name="paw-print-fill" />
				<span>That’s the bottom of the page.</span>
			</div>
			<nav class="gb-pn">
				{prev
					? (
						<a href={href(ctx, prev.route)} class="sq">
							<small>
								<Icon name="arrow-left" />
								Previous
							</small>
							<b>{prev.title}</b>
						</a>
					)
					: <span></span>}
				{next
					? (
						<a href={href(ctx, next.route)} class="sq next">
							<small>
								Next
								<Icon name="arrow-right" />
							</small>
							<b>{next.title}</b>
						</a>
					)
					: <span></span>}
			</nav>
		</footer>
	);
}

/** A guide or reference page: header, body, previous/next, inside the shell. */
export function DocTemplate(
	{ ctx, page, content }: { ctx: PageContext; page?: ResolvedPage; content: DocContent },
): JSX.Element {
	const body = <Prose>{content.body()}</Prose>;
	const measured = measure(body);
	const fm = content.frontmatter;
	return (
		<Document ctx={ctx} title={fm.title} description={fm.description} written>
			<Shell ctx={ctx} page={page} content={content} measured={measured}>
				<article class="gb-article">
					<PageHeader ctx={ctx} frontmatter={fm} minutes={measured.minutes} />
					{body}
					<PrevNext ctx={ctx} />
				</article>
			</Shell>
		</Document>
	);
}
