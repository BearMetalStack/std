/**
 * The shell around a page: one header, sidebar and right rail per {@linkcode ShellLayout}.
 *
 * Everything here renders complete without script. The client layer (`client/mod.ts`) adds what
 * only a browser can know — which pages this reader has visited, how far down the page they are —
 * by finding the `data-gb-*` hooks these components leave.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Page, PageContext, Section, ShellLayout } from "../types.ts";
import { firstPage, href, packageRoute, pagesOf, sectionOf, sectionsOf, toneOf } from "../site.ts";
import { Badge, Icon, Term } from "../blocks/mod.tsx";
import { LOGO } from "./assets.ts";
import { type Measured, outline } from "./measure.ts";

/** What every piece of chrome is handed. */
export interface ChromeProps {
	ctx: PageContext;
	/** The page being read, when the route is one. */
	page?: Page;
	measured: Measured;
}

/** The sections the sidebar lists: the scope's, or the guides when there is no scope. */
function sidebarSections(ctx: PageContext): Section[] {
	return ctx.scope ? sectionsOf(ctx.scope) : ctx.content.guides;
}

function currentSection(ctx: PageContext): Section | undefined {
	const sections = sidebarSections(ctx);
	return (ctx.scope && sectionOf(ctx.scope, ctx.route)) ?? sections[0];
}

/** A top-level destination: the guides, each package, the changelog. */
interface Area {
	id: string;
	label: string;
	route: string;
	on: boolean;
}

function areas(ctx: PageContext): Area[] {
	const out: Area[] = [];
	const guides = firstPage(ctx.content.guides);
	if (guides) {
		out.push({
			id: "guides",
			label: "Guides",
			route: guides.route,
			on: ctx.scope?.kind === "guides",
		});
	}
	for (const pkg of ctx.content.packages) {
		const route = packageRoute(pkg);
		if (!route) continue;
		out.push({
			id: pkg.id,
			label: pkg.name,
			route,
			on: ctx.scope?.kind === "package" && ctx.scope.package.id === pkg.id,
		});
	}
	if (ctx.content.routes.has("changelog")) {
		out.push({
			id: "changelog",
			label: "Changelog",
			route: "changelog",
			on: ctx.route === "changelog" || ctx.route.endsWith("/changelog"),
		});
	}
	return out;
}

// ─── Shared header pieces ─────────────────────────────────────────────────────

function Logo({ ctx }: { ctx: PageContext }): JSX.Element {
	return (
		<a class="gb-logo" href={href(ctx, "")}>
			<img src={LOGO} alt="" />
			<b>{ctx.content.site.name}</b>
		</a>
	);
}

/** A disclosure menu. `<details>` keeps it working with no script; the client closes it on outside clicks. */
function Menu(
	{ label, class: className = "", align = "left", width, children }: {
		label: JSX.Children;
		class?: string;
		align?: "left" | "right";
		width?: string;
		children?: JSX.Children;
	},
): JSX.Element {
	return (
		<details class="gb-menu" data-gb-menu>
			<summary class={`gb-menu-btn ${className}`}>
				{label}
				<Icon name="caret-down" class="gb-caret" />
			</summary>
			<div class={`gb-pop sq ${align}`} style={width ? `width:${width}` : undefined}>
				{children}
			</div>
		</details>
	);
}

function ThemeButton(): JSX.Element {
	return (
		<button type="button" class="gb-icon-btn gb-theme-btn" aria-label="Toggle theme" data-gb-theme>
			<Icon name="moon" class="gb-when-dark" />
			<Icon name="sun" class="gb-when-light" />
		</button>
	);
}

function RepoButton({ ctx }: { ctx: PageContext }): JSX.Element | null {
	if (!ctx.content.site.repository) return null;
	return (
		<a class="gb-icon-btn" aria-label="Repository" href={ctx.content.site.repository}>
			<Icon name="github-logo" />
		</a>
	);
}

function Search(
	{ wide = false, placeholder = "Search docs" }: { wide?: boolean; placeholder?: string },
): JSX.Element {
	return (
		<div class={wide ? "gb-search wide sq" : "gb-search sq"} data-gb-search>
			<Icon name="magnifying-glass" />
			<input type="search" placeholder={placeholder} aria-label="Search" />
			<kbd>/</kbd>
			<div class="gb-pop sq gb-search-pop" hidden></div>
		</div>
	);
}

/** The versions of the package being read; each links to this page in that version, or its start. */
function VersionMenu({ ctx, page }: ChromeProps): JSX.Element | null {
	const scope = ctx.scope;
	if (scope?.kind !== "package" || scope.package.versions.length < 2) return null;
	const target = (v: typeof scope.version) => {
		const same = page &&
			v.sections.find((s) => s.slug === page.section)?.pages.find((p) => p.slug === page.slug);
		return (same ?? firstPage(v))?.route ?? "";
	};
	return (
		<Menu class="gb-ver" align="right" label={<span>v{scope.version.version}</span>}>
			{scope.package.versions.map((v) => (
				<a
					class={v === scope.version ? "gb-pop-item on" : "gb-pop-item"}
					href={href(ctx, target(v))}
				>
					<span>v{v.version}</span>
					{v.latest && <Badge tone="success">latest</Badge>}
				</a>
			))}
		</Menu>
	);
}

function Progress({ page }: { page?: Page }): JSX.Element | null {
	if (!page) return null;
	return (
		<div class="gb-progress">
			<i class="gradient ember animate" data-gb-progress></i>
		</div>
	);
}

// ─── Headers ──────────────────────────────────────────────────────────────────

function HeaderTrail(props: ChromeProps): JSX.Element {
	const { ctx, page } = props;
	const all = areas(ctx);
	const area = all.find((a) => a.on);
	const sections = sidebarSections(ctx);
	const sec = ctx.scope && currentSection(ctx);
	return (
		<header class="gb-header">
			<Logo ctx={ctx} />
			<nav class="gb-crumbs">
				{!area && all.map((a) => <a href={href(ctx, a.route)}>{a.label}</a>)}
				{area && (
					<>
						<span class="gb-sep">/</span>
						<Menu label={area.label}>
							{all.map((a) => (
								<a class={a.on ? "gb-pop-item on" : "gb-pop-item"} href={href(ctx, a.route)}>
									<span>{a.label}</span>
								</a>
							))}
						</Menu>
					</>
				)}
				{sec && sections.length > 1 && (
					<>
						<span class="gb-sep">/</span>
						<Menu
							label={
								<>
									<Icon name={sec.icon} />
									{sec.title}
								</>
							}
						>
							{sections.map((s) => (
								<a
									class={s === sec ? "gb-pop-item on" : "gb-pop-item"}
									href={href(ctx, s.pages[0].route)}
								>
									<Icon name={s.icon} />
									<span>{s.title}</span>
									<small>{s.pages.length}</small>
								</a>
							))}
						</Menu>
					</>
				)}
				{page && sec && sec.pages.length > 1 && (
					<>
						<span class="gb-sep">/</span>
						<Menu label={page.title} width="16rem">
							{sec.pages.map((p) => (
								<a
									class={p.route === page.route ? "gb-pop-item on" : "gb-pop-item"}
									href={href(ctx, p.route)}
									data-gb-route={p.route}
								>
									<span>{p.title}</span>
									<Icon name="check" class="gb-seen" />
								</a>
							))}
						</Menu>
					</>
				)}
			</nav>
			<Search />
			<VersionMenu {...props} />
			<ThemeButton />
			<RepoButton ctx={ctx} />
			<Progress page={page} />
		</header>
	);
}

function HeaderShelves(props: ChromeProps): JSX.Element {
	const { ctx, page } = props;
	const all = areas(ctx);
	const scopePkg = ctx.scope?.kind === "package" ? ctx.scope.package : undefined;
	return (
		<header class="gb-header">
			<Logo ctx={ctx} />
			{ctx.content.packages.length > 0 && (
				<Menu
					class="gb-pkg"
					width="20rem"
					label={
						<>
							<Icon name="cube" />
							<span class="mono">{scopePkg?.name ?? "Packages"}</span>
							{scopePkg?.status && <Badge tone={toneOf(scopePkg.status)}>{scopePkg.status}</Badge>}
						</>
					}
				>
					{ctx.content.packages.map((p) => {
						const route = packageRoute(p);
						if (!route) return null;
						return (
							<a
								class={p === scopePkg ? "gb-pop-item on" : "gb-pop-item"}
								href={href(ctx, route)}
							>
								<Icon name="cube" />
								<span class="mono">{p.name}</span>
								{p.versions[0]?.version && <small class="mono">{p.versions[0].version}</small>}
								{p.status && <Badge tone={toneOf(p.status)}>{p.status}</Badge>}
							</a>
						);
					})}
				</Menu>
			)}
			<nav class="gb-tabs">
				{all.filter((a) => a.id === "guides" || a.id === "changelog").map((a) => (
					<a href={href(ctx, a.route)} class={a.on ? "on" : ""}>{a.label}</a>
				))}
			</nav>
			<span class="gb-grow"></span>
			<Search />
			<VersionMenu {...props} />
			<ThemeButton />
			<Progress page={page} />
		</header>
	);
}

function HeaderDen(props: ChromeProps): JSX.Element {
	const { ctx, page } = props;
	return (
		<header class="gb-header den">
			<Logo ctx={ctx} />
			<nav class="gb-links">
				{areas(ctx).map((a) => <a class={a.on ? "on" : ""} href={href(ctx, a.route)}>{a.label}</a>)}
			</nav>
			<Search wide placeholder="Sniff around the docs…" />
			<VersionMenu {...props} />
			<ThemeButton />
			<RepoButton ctx={ctx} />
			<div class="gb-den-line gradient ember animate"></div>
			<Progress page={page} />
		</header>
	);
}

// ─── Sidebars ─────────────────────────────────────────────────────────────────

function SideTrail({ ctx, measured }: ChromeProps): JSX.Element | null {
	const sections = sidebarSections(ctx);
	const sec = currentSection(ctx);
	if (!sec) return null;
	return (
		<div class="gb-trail">
			{sections.length > 1 && (
				<div class="gb-seg sq" role="tablist">
					{sections.map((s) => (
						<a href={href(ctx, s.pages[0].route)} class={s === sec ? "on sq" : "sq"}>{s.title}</a>
					))}
				</div>
			)}
			<ol class="gb-stations">
				{sec.pages.map((p) => {
					const cur = ctx.route === p.route;
					return (
						<li class={cur ? "cur" : ""} data-gb-route={p.route}>
							<a href={href(ctx, p.route)} class="gb-station">
								<span class={cur ? "gb-dot gradient ember animate" : "gb-dot"}>
									{!cur && <Icon name="check" />}
								</span>
								<span class="gb-st-title">{p.title}</span>
								{p.frontmatter.new ? <Badge tone="brand">new</Badge> : <small>{p.minutes}m</small>}
							</a>
							{cur && measured.headings.length > 0 && (
								<ul class="gb-sub">
									{outline(measured.headings).map((h) => (
										<li>
											<a href={`#${h.id}`} data-gb-heading={h.id}>{h.text}</a>
										</li>
									))}
								</ul>
							)}
						</li>
					);
				})}
			</ol>
			<div class="gb-trail-foot" data-gb-meter={sec.pages.map((p) => p.route).join(" ")}>
				<div class="gb-meter">
					<i></i>
				</div>
				<small>
					<span data-gb-meter-count>0</span> of {sec.pages.length} read in {sec.title}
				</small>
			</div>
		</div>
	);
}

function SideShelves({ ctx }: ChromeProps): JSX.Element {
	return (
		<div class="gb-shelves" data-gb-shelves>
			<label class="gb-filter sq">
				<Icon name="funnel-simple" />
				<input type="search" placeholder="Filter pages" aria-label="Filter pages" data-gb-filter />
			</label>
			{sidebarSections(ctx).map((sh) => (
				<details class="gb-shelf" open>
					<summary class="gb-shelf-h">
						<Icon name={sh.icon} />
						<span>{sh.title}</span>
						<small>{sh.pages.length}</small>
						<Icon name="caret-down" class="gb-caret" />
					</summary>
					<ul>
						{sh.pages.map((p) => (
							<li data-gb-title={p.title.toLowerCase()}>
								<a href={href(ctx, p.route)} class={ctx.route === p.route ? "on sq" : "sq"}>
									<span>{p.title}</span>
									{p.frontmatter.new && <i class="gb-new" title="New"></i>}
									{p.frontmatter.status && (
										<Badge tone={toneOf(p.frontmatter.status)}>{p.frontmatter.status}</Badge>
									)}
								</a>
							</li>
						))}
					</ul>
				</details>
			))}
			<div class="gb-empty" data-gb-filter-empty hidden>
				<Icon name="paw-print" />
				<span>No pages match.</span>
			</div>
		</div>
	);
}

function SideDen({ ctx, page }: ChromeProps): JSX.Element {
	const sections = sidebarSections(ctx);
	const sec = currentSection(ctx);
	const pages = ctx.scope ? pagesOf(ctx.scope) : [];
	const idx = pages.findIndex((p) => p.route === ctx.route);
	const after = idx < 0 ? [] : pages.slice(idx + 1);
	const next = after[0];
	return (
		<div class="gb-den">
			<div class="gb-recent" data-gb-recent hidden>
				<h4>
					<Icon name="footprints" />
					Recently sniffed
				</h4>
				<div></div>
			</div>
			{sections.map((s) => (
				<details class="gb-den-sec" open={s === sec || sections.length <= 4}>
					<summary>
						<Icon name="caret-right" class="gb-caret" />
						<Icon name={s.icon} />
						{s.title}
					</summary>
					<ul>
						{s.pages.map((p) => {
							const cur = p.route === ctx.route;
							return (
								<li data-gb-route={p.route}>
									<a href={href(ctx, p.route)} class={cur ? "on" : ""}>
										{cur ? <Icon name="paw-print-fill" class="gb-paw" /> : <i class="gb-tick"></i>}
										<span>{p.title}</span>
										{!cur && <Icon name="check" class="gb-seen" />}
									</a>
								</li>
							);
						})}
					</ul>
				</details>
			))}
			{next && page && (
				<a
					class="gb-upnext gradient-border border-ember animate sq"
					href={href(ctx, next.route)}
					data-gb-upnext={JSON.stringify(
						after.map((p) => ({ route: p.route, title: p.title, minutes: p.minutes })),
					)}
				>
					<small>Up next</small>
					<b>{next.title}</b>
					<span>
						<span data-gb-upnext-minutes>{next.minutes}</span> min read
						<Icon name="arrow-right" />
					</span>
				</a>
			)}
		</div>
	);
}

// ─── Right rails ──────────────────────────────────────────────────────────────

function AsideMinimap({ measured }: ChromeProps): JSX.Element | null {
	if (!measured.headings.length) return null;
	return (
		<div class="gb-mini" data-gb-minimap data-minutes={measured.minutes}>
			<h4>Page map</h4>
			<div class="gb-mini-wrap">
				<div class="gb-mini-map sq">
					<span class="gb-mini-win"></span>
				</div>
				<div class="gb-mini-labels">
					{measured.headings.filter((h) => h.level === 2).map((h) => (
						<a href={`#${h.id}`} data-gb-heading={h.id}>{h.text}</a>
					))}
				</div>
			</div>
			<p class="gb-mini-meta">
				<Icon name="clock" />
				<span data-gb-left>{measured.minutes} min left</span>
			</p>
		</div>
	);
}

function AsideToc({ ctx, measured }: ChromeProps): JSX.Element | null {
	const h2 = measured.headings.filter((h) => h.level === 2);
	if (!h2.length && !measured.terms.length) return null;
	return (
		<div class="gb-toc" data-gb-toc>
			{h2.length > 0 && (
				<>
					<h4>On this page</h4>
					<ul>
						{h2.map((h) => (
							<li>
								<a href={`#${h.id}`} data-gb-heading={h.id}>
									<span>{h.text}</span>
									<i>
										<b></b>
									</i>
								</a>
							</li>
						))}
					</ul>
				</>
			)}
			{measured.terms.length > 0 && (
				<>
					<h4>Terms on this page</h4>
					<div class="gb-chips">
						{measured.terms.map((id) => (
							<Term id={id}>
								<span class="gb-chip sq">{ctx.content.glossary[id]?.term ?? id}</span>
							</Term>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function AsidePaws(props: ChromeProps): JSX.Element | null {
	const h2 = props.measured.headings.filter((h) => h.level === 2);
	return (
		<div class="gb-paws">
			{h2.length > 0 && (
				<>
					<h4>Your trail</h4>
					<div class="gb-spine" data-gb-spine>
						<i class="gb-spine-fill gradient ember animate"></i>
						<span class="gb-steps-layer"></span>
						{h2.map((h) => (
							<a class="gb-spine-h" href={`#${h.id}`} data-gb-heading={h.id}>
								<span></span>
								{h.text}
							</a>
						))}
						<span class="gb-bear">
							<Icon name="paw-print-fill" />
						</span>
					</div>
				</>
			)}
			<AsideMeta {...props} />
		</div>
	);
}

/** "Edit this page" and the updated date. */
export function AsideMeta({ ctx, page }: ChromeProps): JSX.Element | null {
	if (!page) return null;
	const editBase = ctx.content.site.editBase;
	return (
		<div class="gb-meta">
			{editBase && (
				<a href={editBase + page.file}>
					<Icon name="pencil-simple" />
					Edit this page
				</a>
			)}
			{page.frontmatter.updated && (
				<span>
					<Icon name="clock-counter-clockwise" />
					Updated {page.frontmatter.updated}
				</span>
			)}
		</div>
	);
}

// ─── Layouts ──────────────────────────────────────────────────────────────────

type Part = (props: ChromeProps) => JSX.Element | null;

/** The header, sidebar and right rail of each layout. */
export const LAYOUTS: Record<ShellLayout, { header: Part; side: Part; aside: Part }> = {
	trail: { header: HeaderTrail, side: SideTrail, aside: AsideMinimap },
	shelves: { header: HeaderShelves, side: SideShelves, aside: AsideToc },
	den: { header: HeaderDen, side: SideDen, aside: AsidePaws },
};
