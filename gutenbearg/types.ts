/**
 * @module
 * Public types for `@bearmetal/gutenbearg`.
 *
 * A site is a {@linkcode SiteContent}: the home page, cross-package guides, packages with their
 * versions, a glossary and releases. {@linkcode loadContent} builds one from a directory of
 * markdown, where the file system is the only manifest — order comes from `0016-` prefixes, icons
 * from `[icon]` in section names, versions from directories. Each page's place in the site is a
 * {@linkcode Scope}, and every URL the site answers is a key of {@linkcode SiteContent.routes}.
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
 * The three shells, each a header, sidebar and right rail that belong together:
 *
 * - `trail` — breadcrumbs that are menus of siblings, the current section as a line of stations,
 *   and a clickable page map with time left.
 * - `shelves` — sections as shelves with a live filter, a package switcher, and a TOC that fills
 *   as each section is read.
 * - `den` — the playful one: recently read pages, an Up next card and a paw-print trail.
 */
export type ShellLayout = "trail" | "shelves" | "den";

/**
 * How much of gutenbearg a page brings with it.
 *
 * - `document` — a whole `<html>` document: header, theme toggle, drip's base styles. A
 *   standalone docs site.
 * - `shell` — the sidebar and right rail, with a bar holding search, the area switcher and the
 *   version menu in place of the header. Rendered inside the app's own `Layout()`.
 * - `article` — the page alone, inside the app's own `Layout()`.
 */
export type FrameKind = "document" | "shell" | "article";

/** A changelog entry's kind, in the order the filters list them. */
export type ChangeType = "added" | "changed" | "fixed" | "deprecated" | "breaking";

// ─── Site ─────────────────────────────────────────────────────────────────────

/** Site-wide settings, from the `site:` block of the content root's `index.md`. */
export interface SiteConfig {
	/** Shown beside the logo and in `<title>`. */
	name: string;
	/** Shell used when a request does not pick one. Defaults to `trail`. */
	layout?: ShellLayout;
	/** Repository link in the header. */
	repository?: string;
	/** Prefix for source links on ```` ```signature [path] ```` blocks; the path is appended. */
	sourceBase?: string;
	/** Prefix for "Edit this page" links; a page's path within the content root is appended. */
	editBase?: string;
	/** Theme for drip; defaults to the project's own. */
	theme?: string;
}

/** A page's frontmatter. Anything else in the block is kept and ignored. */
export interface Frontmatter {
	title?: string;
	/** The lede under the title. */
	description?: string;
	status?: Status;
	/** Display date of the last change. */
	updated?: string;
	/** Marks the page as recently added in the navigation. */
	new?: boolean;
	/** Renders the page as "still hibernating" rather than its body. */
	draft?: boolean;
	/** Drops the page from this version on (versioned packages only). */
	removed?: boolean;
	[key: string]: unknown;
}

/** One written page, as it sits in one version of one scope. */
export interface Page {
	/** Identity within its section: the file name without its number and `.md`. */
	slug: string;
	title: string;
	/** URL path without a leading slash, e.g. `router/reference/signal`. */
	route: string;
	/** Owning section's slug. */
	section: string;
	frontmatter: Frontmatter;
	/** Path of the source file relative to the content root. */
	file: string;
	/** Sort key from the file name; unnumbered files sort last. */
	order: number;
	/** First version this page appears in, for versioned packages. */
	addedIn?: string;
	/** Estimated reading time. */
	minutes: number;
	/** A fresh tree for every call; a node can only be placed once. */
	body: () => JSX.Element;
}

/** A directory of pages, in order. */
export interface Section {
	slug: string;
	title: string;
	icon: IconName;
	order: number;
	description?: string;
	pages: Page[];
}

/** One version of a package: its resolved sections after inheritance. */
export interface PackageVersion {
	/** As the directory names it; empty for an unversioned package. */
	version: string;
	latest: boolean;
	/** Route prefix: `router` for the latest, `router/v0.8` for older ones. */
	base: string;
	sections: Section[];
}

/** A documented package. */
export interface PackageInfo {
	/** The directory name, used in URLs. */
	id: string;
	/** Published name, e.g. `@bearmetal/router`. Defaults to the id. */
	name: string;
	status?: Status;
	description?: string;
	/** Newest first. */
	versions: PackageVersion[];
}

/** One term a page links with `[[id]]`. */
export interface GlossaryEntry {
	term: string;
	definition: string;
	/** Where "Read more" goes; omitted when the entry names no page. */
	href?: string;
}

/** One change in a {@linkcode Release}. */
export interface Change {
	type: ChangeType;
	/** Inline rendering of the change, without its type prefix. */
	text: () => JSX.Element;
}

/** One version's entry in a package's changelog. */
export interface Release {
	/** {@linkcode PackageInfo.id}. */
	package: string;
	version: string;
	date?: string;
	changes: Change[];
}

/** A hero call to action. */
export interface Action {
	label: string;
	href: string;
}

/** The home page's frontmatter. */
export interface HomeFrontmatter {
	/** Large gradient wordmark. Defaults to the site name. */
	name: string;
	/** Headline under the wordmark. */
	text?: string;
	tagline?: string;
	/** Small badge above the wordmark, e.g. `v0.9.2 · beta`. */
	badge?: string;
	primary?: Action;
	secondary?: Action;
}

/** The landing page. Its `body` renders between the hero and the package tiles. */
export interface HomeContent {
	frontmatter: HomeFrontmatter;
	body?: () => JSX.Element;
}

/** Where a page lives, which decides the sidebar, breadcrumbs and previous/next. */
export type Scope =
	| { kind: "guides"; sections: Section[] }
	| { kind: "package"; package: PackageInfo; version: PackageVersion };

/** What a route resolves to. */
export type RouteTarget =
	| { kind: "home" }
	| { kind: "page"; page: Page; scope: Scope }
	| { kind: "changelog"; package?: PackageInfo };

/** A problem found while loading content. Loading never throws for content mistakes. */
export interface Diagnostic {
	level: "warn" | "error";
	/** Path relative to the content root. */
	file: string;
	message: string;
}

/** A whole site, ready to render. */
export interface SiteContent {
	site: SiteConfig;
	home: HomeContent;
	guides: Section[];
	packages: PackageInfo[];
	glossary: Record<string, GlossaryEntry>;
	/** Every package's releases, newest first. */
	releases: Release[];
	/** Every URL the site serves, without a leading slash; `""` is the home page. */
	routes: Map<string, RouteTarget>;
	diagnostics: Diagnostic[];
	/** Every icon the content names, for the sprite sheet. */
	icons: Set<string>;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/** What every template receives about the request it is rendering. */
export interface PageContext {
	content: SiteContent;
	/** Route without a leading slash; empty for the home page. */
	route: string;
	layout: ShellLayout;
	/** Prefix for every link the templates emit, without a trailing slash. Empty at the root. */
	base: string;
	/** The page's scope; absent on the home and changelog pages. */
	scope?: Scope;
	/** How much chrome to render. Defaults to `document`. */
	frame?: FrameKind;
	/** Emit the stylesheet `<link>` inside an embedded frame, for hosts that can't add it to `<head>`. */
	inlineStylesheet?: boolean;
}

/** A route ready to render: what it is called, the status to serve it with, and the view. */
export interface RenderedRoute {
	status: number;
	/** The page title, without the site name. */
	title: string;
	description?: string;
	view: () => JSX.Element;
}
