/**
 * @module
 * Public types for `@bearmetal/gutenbearg`.
 *
 * Everything a template renders arrives as one of these: a {@linkcode SiteConfig} describing the
 * whole site (navigation, packages, versions, glossary), and per page either a
 * {@linkcode DocContent}, a {@linkcode ChangelogContent} or the {@linkcode HomeContent}. The
 * frontmatter interfaces are shaped after the YAML a markdown page will carry once content is
 * read from files, so a parsed page drops straight into them.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { IconName } from "./icons.ts";

export type { IconName } from "./icons.ts";

// ─── Vocabulary ───────────────────────────────────────────────────────────────

/** How settled a package or page is. */
export type Status = "stable" | "beta" | "alpha" | "deprecated";

/** A colour role for badges, dots and callouts, mapped onto drip's legible tones. */
export type Tone = "success" | "info" | "warn" | "danger" | "brand" | "neutral";

/**
 * The three shells the design ships, each a header, sidebar and right rail that belong together:
 *
 * - `trail` — breadcrumbs that are menus of siblings, the current section as a line of stations,
 *   and a clickable page map with time left.
 * - `shelves` — navigation by intent, a package switcher that scopes the site, a filterable
 *   sidebar and a TOC that fills as each section is read.
 * - `den` — the playful one: recently read pages, an Up next card and a paw-print trail.
 */
export type ShellLayout = "trail" | "shelves" | "den";

/** A changelog entry's kind, in the order the filters list them. */
export type ChangeType = "added" | "changed" | "fixed" | "deprecated" | "breaking";

// ─── Site ─────────────────────────────────────────────────────────────────────

/** A package the site documents. */
export interface PackageInfo {
	/** Short id used in frontmatter (`package: core`) and filters. */
	id: string;
	/** Published name, e.g. `@bearmetal/router`. */
	name: string;
	version: string;
	status: Status;
	/** Where the package's tile on the home page leads. Defaults to its first page. */
	href?: string;
}

/** A sidebar group in the `shelves` layout, collecting pages by intent rather than section. */
export interface Shelf {
	id: string;
	label: string;
	icon: IconName;
}

/** A page's place in the navigation. It need not be written yet — see {@linkcode DocContent}. */
export interface NavPage {
	/** Path segment under its section. Empty for a section's only page. */
	slug: string;
	title: string;
	/** {@linkcode Shelf} id. */
	shelf?: string;
	/** {@linkcode PackageInfo} id. */
	package?: string;
	status?: Status;
	/** Marks the page as recently added in the navigation. */
	isNew?: boolean;
	/** Reading-time estimate for a page with no content yet. Written pages measure their own. */
	minutes?: number;
}

/** A top-level section: `learn`, `reference`, `changelog`. */
export interface NavSection {
	id: string;
	label: string;
	icon: IconName;
	pages: NavPage[];
}

/** One term a page can link with {@linkcode Term}. */
export interface GlossaryEntry {
	term: string;
	definition: string;
	href: string;
}

/** Everything about a site that is not one page. */
export interface SiteConfig {
	/** Shown beside the logo and in `<title>`. */
	name: string;
	/** Shell used when a request does not pick one. Defaults to `trail`. */
	layout?: ShellLayout;
	/** Repository link in the header. */
	repository?: string;
	/** Prefix for "Edit this page" links; the page's `file` is appended. */
	editBase?: string;
	/** Documented versions, newest first. */
	versions: string[];
	packages: PackageInfo[];
	shelves: Shelf[];
	nav: NavSection[];
	/** Keyed by the id content refers to them by (`<Term id="signal">`). */
	glossary: Record<string, GlossaryEntry>;
	/** Theme for drip; defaults to the project's own. */
	theme?: string;
}

// ─── Pages ────────────────────────────────────────────────────────────────────

/** A content page's frontmatter. */
export interface Frontmatter {
	title: string;
	/** The lede under the title. */
	description?: string;
	/** {@linkcode PackageInfo} id the page belongs to. */
	package?: string;
	status?: Status;
	/** Version the page's subject first appeared in. Older versions get a "doesn't exist" banner. */
	since?: string;
	/** Display date of the last change. */
	updated?: string;
	/** Source path the `signature` block links to. */
	source?: string;
}

/**
 * A written documentation page.
 *
 * `body` is a function because the runtime builds real nodes and a node can only be placed once:
 * each render calls it for a fresh tree. Headings, reading time and the glossary terms a page
 * uses are all measured from that tree, so they never drift from the content.
 */
export interface DocContent {
	kind: "doc";
	frontmatter: Frontmatter;
	/** Source file, relative to {@linkcode SiteConfig.editBase}. */
	file?: string;
	body: () => JSX.Element;
}

/** One change in a {@linkcode Release}. */
export interface Change {
	type: ChangeType;
	/** {@linkcode PackageInfo} id. */
	package?: string;
	text: JSX.Element;
}

/** One version's entry in the changelog. */
export interface Release {
	version: string;
	date: string;
	changes: Change[];
}

/** The changelog page: frontmatter plus releases, newest first. */
export interface ChangelogContent {
	kind: "changelog";
	frontmatter: Frontmatter;
	file?: string;
	releases: () => Release[];
}

/** A hero call to action. */
export interface Action {
	label: string;
	href: string;
}

/** The home page's frontmatter. */
export interface HomeFrontmatter {
	/** Large gradient wordmark. */
	name: string;
	/** Headline under the wordmark. */
	text: string;
	tagline: string;
	/** Small badge above the wordmark, e.g. `v0.9.2 · beta`. */
	badge?: string;
	primary: Action;
	secondary?: Action;
}

/** The landing page. Its `body` renders between the hero and the package tiles. */
export interface HomeContent {
	kind: "home";
	frontmatter: HomeFrontmatter;
	body?: () => JSX.Element;
}

/** Anything a route can resolve to. */
export type PageContent = DocContent | ChangelogContent;

/** A whole site: config, the landing page, and written pages keyed by route (`learn/reactivity`). */
export interface SiteContent {
	site: SiteConfig;
	home: HomeContent;
	pages: Record<string, PageContent>;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/** A {@linkcode NavPage} with where it lives filled in. */
export interface ResolvedPage extends NavPage {
	/** Section id. */
	section: string;
	/** Route without a leading slash, e.g. `learn/reactivity`. */
	route: string;
}

/** What every template receives about the request it is rendering. */
export interface PageContext {
	site: SiteConfig;
	/** Route without a leading slash; empty for the home page. */
	route: string;
	layout: ShellLayout;
	/** The version being read; the newest unless the reader picked another. */
	version: string;
	/** Prefix for every link the templates emit, without a trailing slash. Empty at the root. */
	base: string;
}
