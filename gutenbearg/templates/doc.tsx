import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Page, PageContext } from "../types.ts";
import { firstPage, href, prevNext, sectionOf, toneOf } from "../site.ts";
import { Badge, Icon, Prose } from "../blocks/mod.tsx";
import { Document, Shell } from "./document.tsx";
import { measure } from "./measure.ts";

/** Shown on an older version: a reminder, and a link to this page (or the start) in the latest. */
export function VersionBanner({ ctx, page }: { ctx: PageContext; page: Page }): JSX.Element | null {
	const scope = ctx.scope;
	if (scope?.kind !== "package" || scope.version.latest) return null;
	const latest = scope.package.versions[0];
	const same = latest.sections.find((s) => s.slug === page.section)?.pages.find((p) =>
		p.slug === page.slug
	);
	const target = same ?? firstPage(latest);
	return (
		<div class="gb-verbanner sq">
			<Icon name="clock-counter-clockwise" />
			<span>
				You’re reading the <b>v{scope.version.version}</b> docs. {same
					? "Details may differ from the latest release."
					: "This page is gone in the latest release."}
			</span>
			{target && <a href={href(ctx, target.route)}>Go to v{latest.version}</a>}
		</div>
	);
}

/** Eyebrow, title, lede and the status/since/reading-time facts. */
export function PageHeader(
	{ ctx, page, title, description, minutes }: {
		ctx: PageContext;
		page?: Page;
		title: string;
		description?: string;
		minutes: number;
	},
): JSX.Element {
	const scope = ctx.scope;
	const section = scope && page ? sectionOf(scope, page.route) : undefined;
	const fm = page?.frontmatter;
	return (
		<header class="gb-pagehead">
			{page && <VersionBanner ctx={ctx} page={page} />}
			{section && (
				<div class="gb-eyebrow">
					<Icon name={section.icon} />
					{section.title}
					{scope?.kind === "package" && (
						<>
							<span>·</span>
							<code>{scope.package.name}</code>
						</>
					)}
				</div>
			)}
			<h1>{title}</h1>
			{description && <p class="gb-lede">{description}</p>}
			<div class="gb-facts">
				{fm?.status && <Badge tone={toneOf(fm.status)}>{fm.status}</Badge>}
				{page?.addedIn && (
					<span>
						<Icon name="tag" />
						since v{page.addedIn}
					</span>
				)}
				<span>
					<Icon name="clock" />
					{minutes} min read
				</span>
				{fm?.updated && (
					<span>
						<Icon name="calendar-blank" />
						{fm.updated}
					</span>
				)}
			</div>
		</header>
	);
}

/** The end cap and previous/next cards, within the page's scope. */
export function PrevNext({ ctx }: { ctx: PageContext }): JSX.Element {
	const { prev, next } = ctx.scope ? prevNext(ctx.scope, ctx.route) : {};
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
export function DocTemplate({ ctx, page }: { ctx: PageContext; page: Page }): JSX.Element {
	const body = <Prose>{page.body()}</Prose>;
	const measured = measure(body);
	return (
		<Document ctx={ctx} title={page.title} description={page.frontmatter.description} written>
			<Shell ctx={ctx} page={page} measured={measured}>
				<article class="gb-article">
					<PageHeader
						ctx={ctx}
						page={page}
						title={page.title}
						description={page.frontmatter.description}
						minutes={measured.minutes}
					/>
					{body}
					<PrevNext ctx={ctx} />
				</article>
			</Shell>
		</Document>
	);
}
