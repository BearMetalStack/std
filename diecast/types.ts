/**
 * @module
 * Public types for `@bearmetal/diecast`.
 */

import type { PathParams } from "@bearmetal/router/api";
import type { Router } from "@bearmetal/router";

// ─── Manifest ─────────────────────────────────────────────────────────────────

/**
 * One concrete page to generate from a route pattern.
 *
 * `params` is typed from the literal route path it is declared under, so
 * `"/md/:file"` requires `{ file: string }` and rejects anything else.
 */
export type Permutation<P extends string = string> = {
	/** Values for the route's path parameters. */
	params: PathParams<P>;
	/** Query string to render the page with. Requires `out`. */
	query?: Record<string, string | string[]>;
	/**
	 * Output path relative to `outDir`, overriding the derived one.
	 * Required whenever `query` is set - a query string has no natural file path
	 * and a derived slug would be silently unstable across builds.
	 */
	out?: string;
	/**
	 * When this page's content last changed, for the sitemap's `<lastmod>`.
	 * Left out, the page gets none - the build date is never assumed.
	 */
	lastmod?: Date | string;
};

/** How one route's pages are produced. */
export type RouteManifestEntry<P extends string = string> = {
	/**
	 * The pages to generate. A function is called once at build time and may be
	 * async, which is how a route backed by files on disk declares itself.
	 */
	permutations: Permutation<P>[] | (() => Permutation<P>[] | Promise<Permutation<P>[]>);
	/** Generate nothing for this route, and do not report it as uncovered. */
	skip?: boolean;
};

/**
 * A map from literal route path to how its pages are produced.
 * Build one with {@linkcode defineManifest} rather than annotating by hand -
 * the parameter typing comes from the literal keys.
 */
export type Manifest<K extends string = string> = { [P in K]: RouteManifestEntry<P> };

// ─── Route classification ─────────────────────────────────────────────────────

/** What a route needs before it can be generated. */
export type RouteClass =
	/** A literal path with a GET handler. Generated with no configuration. */
	| "static"
	/** Carries path parameters, so it needs manifest permutations. */
	| "needs-manifest"
	/** Not generatable, or deliberately excluded. */
	| "skip";

/** One route's classification, as returned by `classifyRoutes`. */
export type RouteClassification = {
	path: string;
	class: RouteClass;
	/** Why this route was classified the way it was. Always set for `"skip"`. */
	reason?: string;
	/** Names of the path parameters the pattern declares, in order. */
	params: string[];
};

// ─── Generation ───────────────────────────────────────────────────────────────

/** Where a page's file path comes from. */
export type OutputStyle =
	/** `/about` becomes `about/index.html`. Clean URLs on any static host. */
	| "index"
	/** `/about` becomes `about.html`. Needs host-side extension stripping. */
	| "flat";

/** What diecast looks for beyond the routes it was told about. */
export type DiscoveryOptions = {
	/**
	 * Fetch same-origin assets referenced by emitted HTML, including module
	 * specifiers imported inside inline `<script type="module">` bodies.
	 * Leaving this off breaks `@bearmetal/app` hydration - the bundler's shared
	 * chunks are reachable no other way.
	 */
	assets?: boolean;
	/** Treat same-origin `<a href>` targets as further pages to generate. */
	links?: boolean;
	/** Copy directories mounted with `Router.serveDirectory` into the output. */
	directories?: boolean;
};

/** Everything the generator needs besides the router itself. */
export type DiecastConfig = {
	/** Directory to write the site into. Created if absent. */
	outDir: string;
	/** Origin the synthetic requests are made against. Default `http://localhost`. */
	origin?: string;
	manifest?: Manifest;
	/** Default `"index"`. */
	outputStyle?: OutputStyle;
	/** Abort at the first failure instead of reporting and continuing. */
	strict?: boolean;
	/** Pages rendered in parallel. Default 8. */
	concurrency?: number;
	/** All fields default to true. */
	discover?: DiscoveryOptions;
	/**
	 * Directories to copy that were not registered through `serveDirectory` -
	 * a fallback for routers that serve files some other way.
	 */
	staticDirs?: { dir: string | URL; root: string }[];
	/** Write a `sitemap.xml` listing every generated page. Off unless set. */
	sitemap?: SitemapOptions;
};

/** How the sitemap is written. */
export type SitemapOptions = {
	/**
	 * The public origin the site is deployed at, e.g. `https://bearmetal.dev`.
	 * Sitemap URLs must be absolute, and the build's own `origin` is only a
	 * placeholder for synthetic requests. May include a base path.
	 */
	origin: string;
	/** Path relative to `outDir`. Default `sitemap.xml`. */
	file?: string;
	/**
	 * Whether a directory index is listed with its trailing slash: `/about/`
	 * (the default) or `/about`. Set it to `false` when the host serves
	 * `about/index.html` at `/about` and redirects `/about/` there - Cloudflare's
	 * `html_handling: "drop-trailing-slash"`, say - so the sitemap lists the URL
	 * that answers rather than a redirect. The root is always `/`.
	 */
	trailingSlash?: boolean;
	/**
	 * Leave a page out. Receives the path it is served at, e.g. `/about/`, or
	 * `/about` with `trailingSlash: false`.
	 */
	exclude?: (path: string) => boolean;
	/**
	 * When a page last changed, for pages the manifest cannot date - static
	 * routes and followed links. Receives the served path (in the same form
	 * `exclude` does) and the page, whose
	 * `lastmod` holds the manifest's value if it set one; returning a value
	 * overrides it, returning `undefined` keeps it. A page left undated gets no
	 * `<lastmod>`.
	 */
	lastmod?: (
		path: string,
		page: GeneratedPage,
	) => Date | string | undefined | Promise<Date | string | undefined>;
};

/** A site, ready to build. Produced by `defineSite`. */
export type SiteDefinition = DiecastConfig & { router: Router };

/** One page that was written. */
export type GeneratedPage = {
	/** The URL it was rendered from, including any query string. */
	url: string;
	/** Path written, relative to `outDir`. */
	file: string;
	status: number;
	contentType: string | null;
	bytes: number;
	/** The manifest permutation's `lastmod`, when it set one. */
	lastmod?: Date | string;
};

/** One page that could not be written. */
export type GenerationFailure = {
	url: string;
	status?: number;
	/** The thrown error, when `onError` caught one. */
	error?: unknown;
	message: string;
};

/** A problem with the manifest itself, found before any page was rendered. */
export type ManifestProblem = {
	kind: "unknown-route" | "uncovered-route" | "missing-param" | "missing-out";
	path: string;
	message: string;
};

/** The outcome of a build. */
export type GenerationReport = {
	pages: GeneratedPage[];
	failures: GenerationFailure[];
	problems: ManifestProblem[];
	/** Directories copied wholesale, as `root` prefixes. */
	copiedDirs: string[];
	/** The sitemap written, relative to `outDir`, when one was requested. */
	sitemap?: string;
	/** Wall-clock duration in milliseconds. */
	duration: number;
	get ok(): boolean;
};

/** Options for the writer, shared by the build and the write-through module. */
export type WriteOptions = {
	outDir: string;
	outputStyle?: OutputStyle;
	/** Explicit path relative to `outDir`, bypassing derivation. */
	out?: string;
};
