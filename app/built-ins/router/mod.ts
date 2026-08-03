/**
 * A client-side router built the same way as the other built-ins: `<Route>`
 * declares, `<Router>` derives what to show from the URL, and the JSX runtime
 * swaps the result in as a signal.
 *
 * @example
 * ```tsx
 * <Router fallback={() => <NotFound />}>
 *   <Route path="/">{() => <Home />}</Route>
 *   <Route path="/users/:id">{() => <User />}</Route>
 *   <Route path="/settings" label="Settings">
 *     {() => <SettingsShell><Outlet /></SettingsShell>}
 *     <Route path="/">{() => <SettingsIndex />}</Route>
 *     <Route path="/profile">{() => <Profile />}</Route>
 *   </Route>
 * </Router>
 * ```
 *
 * @module
 */

export { Outlet, Route, type RouteProps, Router, type RouterProps } from "./Router.ts";
export { useParam, useParams, useRouteMatch, useRoutes } from "./Router.ts";
export { Link, type LinkProps } from "./Link.tsx";
export {
	currentHref,
	interceptLinkClicks,
	navigate,
	type NavigateOptions,
	setUrl,
	syncUrl,
	urlSignal,
} from "./location.ts";
export {
	flattenRoutes,
	isActivePath,
	isRouteDescriptor,
	matchRoutes,
	ROUTE,
	type RouteChain,
	type RouteContext,
	type RouteDescriptor,
	type RouteMatch,
	type RouteMeta,
	type RouteRenderer,
} from "./match.ts";
export { getRouteFrame, type RouteFrame, type RouterHandle } from "./frame.ts";
