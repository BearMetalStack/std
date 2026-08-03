/**
 * Route descriptors and path matching.
 *
 * `<Route>` builds a plain descriptor rather than rendering anything, so the
 * whole route tree is known statically the moment `<Router>` is constructed.
 * That is what lets matching be a single pass over pre-joined patterns, and it
 * leaves the tree available for anything that wants to read routes without
 * rendering them (navs, breadcrumbs, sitemaps).
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { joinPath } from "@bearmetal/miscellanea";

/** Brands an object as a route descriptor across bundle boundaries. */
export const ROUTE: unique symbol = Symbol.for("bearmetal.router.route");

/** Produces the content for a matched route. */
export type RouteRenderer = () => JSX.Element | null;

/**
 * Descriptive fields carried on a route but never used for matching.
 *
 * Open by design — a nav or breadcrumb built over the route tree reads whatever
 * it needs from here.
 */
export interface RouteMeta {
	/** Human-readable name, for navs and breadcrumbs. */
	label?: string;
	/** Icon identifier, interpreted by whatever renders it. */
	icon?: string;
	/** Hint that generated navigation should skip this route. */
	hidden?: boolean;
	[key: string]: unknown;
}

/** One node of the declared route tree, as produced by `<Route>`. */
export interface RouteDescriptor {
	readonly [ROUTE]: true;
	/** Path relative to the parent route. */
	path: string;
	/** Content renderer. A route without one can still act as a path prefix. */
	render?: RouteRenderer;
	/** Nested routes, matched against the remainder of the path. */
	children: RouteDescriptor[];
	meta: RouteMeta;
}

/** A root-to-leaf path through the route tree, with its fully joined pattern. */
export interface RouteChain {
	/** Descriptors from outermost to innermost. */
	routes: RouteDescriptor[];
	/** The joined pattern this chain matches, e.g. `/users/:id/posts`. */
	pattern: string;
}

/** The result of matching a URL against a route tree. */
export interface RouteMatch {
	/** Matched descriptors, outermost first. `<Outlet>` walks this. */
	routes: RouteDescriptor[];
	/** The pattern that matched. Doubles as the identity of the matched route. */
	pattern: string;
	/** Named groups from every segment of the chain, merged. */
	params: Record<string, string>;
	/** The URL that was matched. */
	url: URL;
}

export function isRouteDescriptor(value: unknown): value is RouteDescriptor {
	return typeof value === "object" && value !== null && ROUTE in value;
}

/**
 * Expands a route tree into the ordered list of chains to match against.
 *
 * Children come before the parent's own chain, so a parent that declares an
 * index child (`path="/"`) resolves to that child rather than to itself. Within
 * a level, declaration order wins — first match, not most specific.
 *
 * A route with children also yields a chain for itself when it can render,
 * which is what makes a parent display alone if no child matches.
 */
export function flattenRoutes(
	routes: readonly RouteDescriptor[],
	base = "/",
): RouteChain[] {
	const chains: RouteChain[] = [];

	for (const route of routes) {
		const pattern = joinPath(base, route.path) || "/";

		if (route.children.length) {
			// A wildcard parent's children are what consume the wildcard, so drop it
			// before joining. `joinPath` would otherwise swallow the child segment:
			// it treats a preceding `*` as something to pop, not to keep.
			const childBase = pattern.endsWith("/*") ? pattern.slice(0, -2) || "/" : pattern;
			for (const child of flattenRoutes(route.children, childBase)) {
				chains.push({ routes: [route, ...child.routes], pattern: child.pattern });
			}
		}

		if (route.render) chains.push({ routes: [route], pattern });
		else if (!route.children.length) {
			console.warn(
				`<Route path="${route.path}"> has neither a render function nor child routes — it can never render anything.`,
			);
		}
	}

	return chains;
}

const patterns = new Map<string, URLPattern | null>();

function compile(pathname: string): URLPattern | null {
	if (patterns.has(pathname)) return patterns.get(pathname)!;
	let pattern: URLPattern | null = null;
	try {
		pattern = new URLPattern({ pathname });
	} catch {
		console.warn(`<Route> path "${pathname}" is not a valid URL pattern and will never match.`);
	}
	patterns.set(pathname, pattern);
	return pattern;
}

/**
 * Tests one pattern against a pathname, returning its named groups.
 *
 * A trailing `/*` also matches the bare prefix: `/docs/*` matches `/docs`, not
 * just `/docs/intro`. `URLPattern` does not do this on its own, and a section
 * root that fails to match its own section is never what was meant.
 */
export function execPattern(
	pathname: string,
	against: string,
): Record<string, string> | null {
	const result = compile(pathname)?.exec({ pathname: against });
	if (result) return groupsOf(result);
	if (pathname.endsWith("/*")) return execPattern(pathname.slice(0, -2) || "/", against);
	return null;
}

function groupsOf(result: URLPatternResult): Record<string, string> {
	const params: Record<string, string> = {};
	for (const [key, value] of Object.entries(result.pathname.groups)) {
		if (value !== undefined) params[key] = value;
	}
	return params;
}

/** Finds the first chain matching `url`. */
export function matchRoutes(chains: readonly RouteChain[], url: URL): RouteMatch | null {
	for (const chain of chains) {
		const params = execPattern(chain.pattern, url.pathname);
		if (!params) continue;
		return { routes: chain.routes, pattern: chain.pattern, params, url };
	}
	return null;
}

/**
 * Whether `pathname` is "at" `target` — used for active-link styling.
 *
 * Non-exact matching treats `target` as a section: `/settings` is active for
 * `/settings/profile` but not for `/settings-other`. The root is the exception
 * and always requires an exact match, since a `/` that lights up on every page
 * is never what a nav wants.
 */
export function isActivePath(target: string, pathname: string, exact = false): boolean {
	const normalized = normalize(target);
	const current = normalize(pathname);
	if (current === normalized) return true;
	if (exact || normalized === "/") return false;
	return current.startsWith(`${normalized}/`);
}

function normalize(pathname: string): string {
	if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
	return pathname;
}
