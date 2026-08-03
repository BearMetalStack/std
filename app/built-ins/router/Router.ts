/**
 * `<Router>`, `<Route>` and `<Outlet>`.
 *
 * The router derives everything it shows from the current URL, every time it
 * renders. There is no activation state, no pre-rendered markup to reconcile
 * with, and nothing to synchronise on startup — a reload renders the matching
 * route because matching the URL *is* the render.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { getCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "../../signals/wrapper.ts";
import { createComputed } from "../../signals.ts";
import { drain } from "../../util/drain.ts";
import { borrowOwnership } from "../../util/ownership.ts";
import { getRouteFrame, type RouterHandle, withRouteFrame } from "./frame.ts";
import { currentHref, interceptLinkClicks, urlSignal } from "./location.ts";
import {
	flattenRoutes,
	isRouteDescriptor,
	matchRoutes,
	ROUTE,
	type RouteChain,
	type RouteDescriptor,
	type RouteMatch,
	type RouteMeta,
	type RouteRenderer,
} from "./match.ts";

/**
 * The JSX runtime is chosen once, at import time, from `typeof document`. The
 * server half is `async`, which means nested `<Route>` elements arrive as
 * promises there and as plain descriptors on the client — the one place this
 * module has to care which half is live.
 */
function isServerRuntime(): boolean {
	return typeof document === "undefined";
}

function toURL(value: string | URL): URL {
	return new URL(value, currentHref());
}

function flatten(children: unknown): unknown[] {
	if (children == null) return [];
	return (Array.isArray(children) ? children : [children]).flat(Infinity as 0);
}

// -- <Route> --

/** Props for {@linkcode Route}. */
export interface RouteProps extends RouteMeta {
	/**
	 * Path relative to the enclosing route, as a `URLPattern` pathname —
	 * `:name` captures a segment, `*` matches the rest. Defaults to `/`.
	 */
	path?: string;
	/**
	 * A render function, and/or nested `<Route>` elements.
	 *
	 * The render function is deliberately a function rather than an element: it
	 * runs only when the route matches, and re-runs when the match changes.
	 */
	children?: unknown;
}

/**
 * Declares one route.
 *
 * Renders nothing itself — it returns a descriptor that the enclosing
 * `<Router>` collects. A route with children acts as a layout: give it a
 * renderer containing an `<Outlet>` to wrap them, or leave the renderer off to
 * use it as a bare path prefix.
 *
 * @example
 * ```tsx
 * <Route path="/settings" label="Settings">
 *   {() => <Shell><Outlet /></Shell>}
 *   <Route path="/">{() => <SettingsIndex />}</Route>
 *   <Route path="/users/:id">{() => <User />}</Route>
 * </Route>
 * ```
 */
export function Route(props: RouteProps): JSX.Element {
	if (isServerRuntime()) {
		return Promise.all(flatten(props.children))
			.then((children) => build(props, children)) as unknown as JSX.Element;
	}
	return build(props, flatten(props.children)) as unknown as JSX.Element;
}

function build(props: RouteProps, children: unknown[]): RouteDescriptor {
	const { path = "/", children: _, ...meta } = props;
	let render: RouteRenderer | undefined;
	const nested: RouteDescriptor[] = [];

	for (const child of children) {
		if (child == null || child === false) continue;
		if (isRouteDescriptor(child)) {
			nested.push(child);
		} else if (typeof child === "function") {
			if (render) {
				console.warn(
					`<Route path="${path}"> has more than one render function; only the first is used.`,
				);
			} else render = child as RouteRenderer;
		} else {
			console.warn(
				`<Route path="${path}"> ignored a child that is neither a render function nor a <Route>. ` +
					"Route content must be wrapped in a function so it renders only when matched: {() => <Thing />}",
			);
		}
	}

	return { [ROUTE]: true, path, render, children: nested, meta };
}

// -- <Router> --

/** Props for {@linkcode Router}. */
export interface RouterProps {
	/** `<Route>` elements. Anything else is ignored with a warning. */
	children?: unknown;
	/** Path every route is mounted under. Defaults to `/`. */
	base?: string;
	/**
	 * URL to match instead of the live location.
	 *
	 * Required when server-rendering, where there is no `location` to read.
	 * On the client this pins the router to a fixed URL, which is mostly useful
	 * for tests and previews.
	 */
	url?: string | URL;
	/** Rendered when no route matches. */
	fallback?: () => JSX.Element | null;
	/**
	 * Route same-origin anchor clicks through the router instead of reloading
	 * the page. Defaults to `true`.
	 */
	interceptLinks?: boolean;
}

/**
 * Matches the current URL against its `<Route>` children and renders the
 * winner.
 *
 * On the client the result is a signal, so the JSX runtime swaps the rendered
 * route in place as the URL changes. A matched route's renderer runs again only
 * when the *route* changes: navigating `/users/1` → `/users/2` keeps the tree
 * and updates {@linkcode useParams} instead of rebuilding.
 *
 * @example
 * ```tsx
 * <Router fallback={() => <NotFound />}>
 *   <Route path="/">{() => <Home />}</Route>
 *   <Route path="/users/:id">{() => <User />}</Route>
 * </Router>
 * ```
 */
export function Router(props: RouterProps): JSX.Element {
	if (isServerRuntime()) return renderOnServer(props) as unknown as JSX.Element;
	return renderOnClient(props) as unknown as JSX.Element;
}

function collect(children: unknown[], base: string): RouteChain[] {
	const routes: RouteDescriptor[] = [];
	for (const child of children) {
		if (child == null || child === false) continue;
		if (isRouteDescriptor(child)) routes.push(child);
		else console.warn("<Router> ignored a child that is not a <Route>.");
	}
	return flattenRoutes(routes, base);
}

function renderOnClient(props: RouterProps): Signal.Computed<JSX.Element | null> {
	const base = props.base ?? "/";
	const chains = collect(flatten(props.children), base);

	if (props.interceptLinks !== false) {
		const release = interceptLinkClicks();
		getCurrentOwner()?.registerCleanup(release);
	}

	const url = urlSignal();
	const match = createComputed(() =>
		matchRoutes(chains, toURL(props.url != null ? String(props.url) : url.get()))
	);
	const handle: RouterHandle = { chains, base, match };

	const cleanups: Array<() => void> = [];
	// The matched pattern is the identity of the rendered tree. Holding the
	// previous node against it is what keeps a params-only navigation from
	// tearing down and rebuilding a route that has not actually changed.
	let lastPattern: string | null | undefined;
	let lastNode: JSX.Element | null = null;

	return createComputed(() => {
		const current = match.get();
		const pattern = current?.pattern ?? null;
		if (pattern === lastPattern) return lastNode;
		lastPattern = pattern;
		drain(cleanups, (fn) => fn());

		lastNode = borrowOwnership(
			{ registerCleanup: (fn) => cleanups.push(fn) },
			() => current ? renderChain(handle, current, 0) : props.fallback?.() ?? null,
			() => drain(cleanups, (fn) => fn()),
		);
		return lastNode;
	});
}

async function renderOnServer(props: RouterProps): Promise<JSX.Element | null> {
	const base = props.base ?? "/";
	const chains = collect(await Promise.all(flatten(props.children)), base);

	// Without a URL there is nothing to match, and guessing is worse than
	// rendering nothing: falling back to `/` emits the *wrong* route's markup on
	// every other path, which the client then has to tear out and replace on
	// hydration — a visible flash, and a full mount/unmount cycle for every
	// component in the route that never should have rendered.
	if (props.url == null) {
		console.warn(
			"<Router> rendered without a `url` prop outside the browser, so it rendered nothing. " +
				"Server-side there is no `location` to match against — pass the request URL " +
				"(<Router url={ctx.request.url}>) to server-render routed content.",
		);
		return null;
	}

	const url = toURL(props.url);
	const current = matchRoutes(chains, url);
	const handle: RouterHandle = { chains, base, match: { get: () => current } };

	if (!current) return (await props.fallback?.()) ?? null;
	return await renderChain(handle, current, 0);
}

function renderChain(
	router: RouterHandle,
	match: RouteMatch,
	depth: number,
): JSX.Element | null {
	const route = match.routes[depth];
	if (!route?.render) return null;
	return withRouteFrame({ router, match, depth }, route.render);
}

// -- <Outlet> --

/**
 * Renders the matched child route inside its parent's layout.
 *
 * @remarks In an `async` route renderer, call this before the first `await` —
 * the frame it reads is a synchronous call-stack variable.
 */
export function Outlet(): JSX.Element | null {
	const frame = getRouteFrame();
	if (!frame) {
		console.warn("<Outlet> was rendered outside of a route; there is nothing to render into it.");
		return null;
	}
	return renderChain(frame.router, frame.match, frame.depth + 1);
}

// -- hooks --

/**
 * The current route's path parameters, merged across the whole matched chain
 * so a child sees its ancestors' captures too.
 *
 * Reactive: the returned signal updates on a params-only navigation without the
 * route re-rendering.
 *
 * @example
 * ```tsx
 * const params = useParams();
 * return <h1>User {params.get().id}</h1>;
 * ```
 */
export function useParams(): Signal.Computed<Record<string, string>> {
	const match = useRouteMatch();
	return createComputed(() => match.get()?.params ?? {});
}

/** A single path parameter, by name. Shorthand for reading {@linkcode useParams}. */
export function useParam(name: string): Signal.Computed<string | undefined> {
	const params = useParams();
	return createComputed(() => params.get()[name]);
}

/** The enclosing router's current match, or `null` when nothing matches. */
export function useRouteMatch(): Signal.Computed<RouteMatch | null> {
	const frame = getRouteFrame();
	if (!frame) {
		console.warn(
			"useRouteMatch()/useParams() was called outside of a route renderer and will always be empty. " +
				"Call it during a <Route>'s render, before any `await`.",
		);
		return createComputed(() => null);
	}
	const { match } = frame.router;
	return createComputed(() => match.get());
}

/**
 * Every chain the enclosing router can match, in match order.
 *
 * The declared route tree, flattened — enough to build a nav, breadcrumbs or a
 * sitemap without rendering anything. Route metadata (`label`, `icon`,
 * `hidden`, and anything else passed to `<Route>`) rides along on each
 * descriptor's `meta`.
 */
export function useRoutes(): readonly RouteChain[] {
	return getRouteFrame()?.router.chains ?? [];
}
