/**
 * The shell around a page: one header, sidebar and right rail per {@linkcode ShellLayout}.
 *
 * Everything here renders complete without script. The client layer (`client/mod.ts`) adds what
 * only a browser can know — which pages this reader has visited, how far down the page they are —
 * by finding the `data-gb-*` hooks these components leave.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Frontmatter, PageContent, PageContext, ResolvedPage, ShellLayout } from "../types.ts";
import { allPages, href, routeOf, toneOf } from "../site.ts";
import { Badge, Icon, Term } from "../blocks/mod.tsx";
import { LOGO, LOGO_ANIMATED } from "./assets.ts";
import { type Measured, outline } from "./measure.ts";

/** What every piece of chrome is handed. */
export interface ChromeProps {
	ctx: PageContext;
	/** The navigation entry for this route, written or not. */
	page?: ResolvedPage;
	/** The page's content, when it is written. */
	content?: PageContent;
	measured: Measured;
}

export { LOGO, LOGO_ANIMATED };

const sectionOf = (ctx: PageContext) => ctx.site.nav.find((s) => s.id === ctx.route.split("/")[0]);
const firstRoute = (s: { id: string; pages: { slug: string }[] }) =>
	routeOf(s.id, s.pages[0]?.slug ?? "");
const minutesOf = (p: ResolvedPage) => p.minutes ?? 3;

// ─── Shared header pieces ─────────────────────────────────────────────────────

function Logo({ ctx }: { ctx: PageContext }): JSX.Element {
	return (
		<a class="gb-logo" href={href(ctx, "")}>
			<img src={LOGO} alt="" />
			<b>{ctx.site.name}</b>
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
	if (!ctx.site.repository) return null;
	return (
		<a class="gb-icon-btn" aria-label="Repository" href={ctx.site.repository}>
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

function VersionMenu({ ctx }: { ctx: PageContext }): JSX.Element {
	return (
		<Menu class="gb-ver" align="right" label={<span>v{ctx.version}</span>}>
			{ctx.site.versions.map((v, i) => (
				<a class={v === ctx.version ? "gb-pop-item on" : "gb-pop-item"} href={`?v=${v}`}>
					<span>v{v}</span>
					{i === 0 && <Badge tone="success">latest</Badge>}
				</a>
			))}
		</Menu>
	);
}

function Progress({ page }: { page?: ResolvedPage }): JSX.Element | null {
	if (!page) return null;
	return (
		<div class="gb-progress">
			<i class="gradient ember animate" data-gb-progress></i>
		</div>
	);
}

// ─── Headers ──────────────────────────────────────────────────────────────────

function HeaderTrail({ ctx, page }: ChromeProps): JSX.Element {
	const sec = sectionOf(ctx);
	return (
		<header class="gb-header">
			<Logo ctx={ctx} />
			<nav class="gb-crumbs">
				{!sec && ctx.site.nav.map((s) => <a href={href(ctx, firstRoute(s))}>{s.label}</a>)}
				{sec && (
					<>
						<span class="gb-sep">/</span>
						<Menu
							label={
								<>
									<Icon name={sec.icon} />
									{sec.label}
								</>
							}
						>
							{ctx.site.nav.map((s) => (
								<a
									class={s.id === sec.id ? "gb-pop-item on" : "gb-pop-item"}
									href={href(ctx, firstRoute(s))}
								>
									<Icon name={s.icon} />
									<span>{s.label}</span>
									<small>{s.pages.length}</small>
								</a>
							))}
						</Menu>
						{page && sec.pages.length > 1 && (
							<>
								<span class="gb-sep">/</span>
								<Menu label={page.title} width="16rem">
									{sec.pages.map((p) => {
										const r = routeOf(sec.id, p.slug);
										return (
											<a
												class={r === page.route ? "gb-pop-item on" : "gb-pop-item"}
												href={href(ctx, r)}
												data-gb-route={r}
											>
												<span>{p.title}</span>
												<Icon name="check" class="gb-seen" />
											</a>
										);
									})}
								</Menu>
							</>
						)}
					</>
				)}
			</nav>
			<Search />
			<VersionMenu ctx={ctx} />
			<ThemeButton />
			<RepoButton ctx={ctx} />
			<Progress page={page} />
		</header>
	);
}

function HeaderShelves({ ctx, page }: ChromeProps): JSX.Element {
	const section = ctx.route.split("/")[0];
	const tabs: [string, string][] = [["learn", "Guides"], ["reference", "API"], [
		"changelog",
		"Changelog",
	]];
	const known = tabs.filter(([id]) => ctx.site.nav.some((s) => s.id === id));
	return (
		<header class="gb-header">
			<Logo ctx={ctx} />
			<Menu
				class="gb-pkg"
				width="20rem"
				label={
					<>
						<Icon name="cube" />
						<span class="mono" data-gb-pkg-label>All packages</span>
					</>
				}
			>
				<button type="button" class="gb-pop-item on" data-gb-pkg="">
					<Icon name="stack" />
					<span>All packages</span>
				</button>
				{ctx.site.packages.map((p) => (
					<button type="button" class="gb-pop-item" data-gb-pkg={p.id} data-gb-pkg-name={p.name}>
						<Icon name="cube" />
						<span class="mono">{p.name}</span>
						<small class="mono">{p.version}</small>
						<Badge tone={toneOf(p.status)}>{p.status}</Badge>
					</button>
				))}
			</Menu>
			<nav class="gb-tabs">
				{known.map(([id, label]) => {
					const s = ctx.site.nav.find((x) => x.id === id)!;
					return <a href={href(ctx, firstRoute(s))} class={section === id ? "on" : ""}>{label}</a>;
				})}
			</nav>
			<span class="gb-grow"></span>
			<Search />
			<VersionMenu ctx={ctx} />
			<ThemeButton />
			<Progress page={page} />
		</header>
	);
}

function HeaderDen({ ctx, page }: ChromeProps): JSX.Element {
	const section = ctx.route.split("/")[0];
	return (
		<header class="gb-header den">
			<Logo ctx={ctx} />
			<nav class="gb-links">
				{ctx.site.nav.map((s) => (
					<a class={section === s.id ? "on" : ""} href={href(ctx, firstRoute(s))}>{s.label}</a>
				))}
			</nav>
			<Search wide placeholder="Sniff around the docs…" />
			<VersionMenu ctx={ctx} />
			<ThemeButton />
			<RepoButton ctx={ctx} />
			<div class="gb-den-line gradient ember animate"></div>
			<Progress page={page} />
		</header>
	);
}

// ─── Sidebars ─────────────────────────────────────────────────────────────────

function SideTrail({ ctx, measured }: ChromeProps): JSX.Element {
	const sec = sectionOf(ctx) ?? ctx.site.nav[0];
	const pages = allPages(ctx.site).filter((p) => p.section === sec.id);
	return (
		<div class="gb-trail">
			<div class="gb-seg sq" role="tablist">
				{ctx.site.nav.map((s) => (
					<a href={href(ctx, firstRoute(s))} class={s.id === sec.id ? "on sq" : "sq"}>{s.label}</a>
				))}
			</div>
			<ol class="gb-stations">
				{pages.map((p) => {
					const cur = ctx.route === p.route;
					return (
						<li class={cur ? "cur" : ""} data-gb-route={p.route}>
							<a href={href(ctx, p.route)} class="gb-station">
								<span class={cur ? "gb-dot gradient ember animate" : "gb-dot"}>
									{!cur && <Icon name="check" />}
								</span>
								<span class="gb-st-title">{p.title}</span>
								{p.isNew
									? <Badge tone="brand">new</Badge>
									: <small>{cur && measured.minutes ? measured.minutes : minutesOf(p)}m</small>}
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
			<div class="gb-trail-foot" data-gb-meter={pages.map((p) => p.route).join(" ")}>
				<div class="gb-meter">
					<i></i>
				</div>
				<small>
					<span data-gb-meter-count>0</span> of {pages.length} read in {sec.label}
				</small>
			</div>
		</div>
	);
}

function SideShelves({ ctx }: ChromeProps): JSX.Element {
	const pages = allPages(ctx.site);
	return (
		<div class="gb-shelves" data-gb-shelves>
			<label class="gb-filter sq">
				<Icon name="funnel-simple" />
				<input type="search" placeholder="Filter pages" aria-label="Filter pages" data-gb-filter />
			</label>
			<button type="button" class="gb-scope" data-gb-scope hidden>
				Showing <b class="mono"></b>
				<Icon name="x" />
			</button>
			{ctx.site.shelves.map((sh) => {
				const items = pages.filter((p) => p.shelf === sh.id);
				if (!items.length) return null;
				return (
					<details class="gb-shelf" open>
						<summary class="gb-shelf-h">
							<Icon name={sh.icon} />
							<span>{sh.label}</span>
							<small>{items.length}</small>
							<Icon name="caret-down" class="gb-caret" />
						</summary>
						<ul>
							{items.map((p) => (
								<li data-gb-package={p.package ?? ""} data-gb-title={p.title.toLowerCase()}>
									<a href={href(ctx, p.route)} class={ctx.route === p.route ? "on sq" : "sq"}>
										<span>{p.title}</span>
										{p.isNew && <i class="gb-new" title="New"></i>}
										{p.status && <Badge tone={toneOf(p.status)}>{p.status}</Badge>}
										{p.package && <small class="mono gb-pkg-hint">{p.package}</small>}
									</a>
								</li>
							))}
						</ul>
					</details>
				);
			})}
			<div class="gb-empty" data-gb-filter-empty hidden>
				<Icon name="paw-print" />
				<span>No pages match.</span>
			</div>
		</div>
	);
}

function SideDen({ ctx, page, content }: ChromeProps): JSX.Element {
	const pages = allPages(ctx.site);
	const idx = pages.findIndex((p) => p.route === ctx.route);
	const after = idx < 0 ? [] : pages.slice(idx + 1);
	const next = after[0];
	const section = ctx.route.split("/")[0];
	return (
		<div class="gb-den">
			<div class="gb-recent" data-gb-recent hidden>
				<h4>
					<Icon name="footprints" />
					Recently sniffed
				</h4>
				<div></div>
			</div>
			{ctx.site.nav.map((s) => (
				<details class="gb-den-sec" open={s.id === section || s.id !== "changelog"}>
					<summary>
						<Icon name="caret-right" class="gb-caret" />
						<Icon name={s.icon} />
						{s.label}
					</summary>
					<ul>
						{s.pages.map((p) => {
							const r = routeOf(s.id, p.slug);
							const cur = r === ctx.route;
							return (
								<li data-gb-route={r}>
									<a href={href(ctx, r)} class={cur ? "on" : ""}>
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
			{next && page && content && (
				<a
					class="gb-upnext gradient-border border-ember animate sq"
					href={href(ctx, next.route)}
					data-gb-upnext={JSON.stringify(
						after.map((p) => ({ route: p.route, title: p.title, minutes: minutesOf(p) })),
					)}
				>
					<small>Up next</small>
					<b>{next.title}</b>
					<span>
						<span data-gb-upnext-minutes>{minutesOf(next)}</span> min read
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
								<span class="gb-chip sq">{ctx.site.glossary[id]?.term ?? id}</span>
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
export function AsideMeta({ ctx, content }: ChromeProps): JSX.Element | null {
	if (!content) return null;
	const fm: Frontmatter = content.frontmatter;
	const edit = ctx.site.editBase && content.file ? ctx.site.editBase + content.file : undefined;
	return (
		<div class="gb-meta">
			{edit && (
				<a href={edit}>
					<Icon name="pencil-simple" />
					Edit this page
				</a>
			)}
			{fm.updated && (
				<span>
					<Icon name="clock-counter-clockwise" />
					Updated {fm.updated}
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
