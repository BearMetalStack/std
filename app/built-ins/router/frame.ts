/**
 * The ambient "which route am I rendering" frame.
 *
 * `<Outlet>` and `useParams()` need to know their position in the matched
 * chain, and JSX gives functional components no way to reach their caller. The
 * frame is a call-stack variable, set around the *synchronous* invocation of a
 * route's renderer — exactly the technique `getCurrentOwner()` in the JSX
 * runtime already uses, and correct for the same reason: JSX evaluates a
 * component's children synchronously while building its props.
 *
 * The one rule that falls out of that: in an `async` route renderer, reach for
 * `<Outlet>` / `useParams()` before the first `await`. After it, the frame has
 * moved on.
 */

import type { Signal } from "../../signals/wrapper.ts";
import type { RouteChain, RouteMatch } from "./match.ts";

/** The router a frame belongs to, as seen by routes rendering inside it. */
export interface RouterHandle {
	/** Every chain the router can match, in match order. */
	chains: readonly RouteChain[];
	/** The live match. A signal on the client; a constant on the server. */
	match: Signal.Computed<RouteMatch | null> | { get(): RouteMatch | null };
	/** Path every route in this router is mounted under. */
	base: string;
}

/** One level of the matched chain, as seen from inside a route renderer. */
export interface RouteFrame {
	router: RouterHandle;
	match: RouteMatch;
	/** Index into `match.routes` of the route currently rendering. */
	depth: number;
}

let current: RouteFrame | null = null;

/** The frame of the route currently rendering, or `null` outside a router. */
export function getRouteFrame(): RouteFrame | null {
	return current;
}

/** Runs `fn` with `frame` installed, restoring the previous frame afterwards. */
export function withRouteFrame<T>(frame: RouteFrame, fn: () => T): T {
	const previous = current;
	current = frame;
	try {
		return fn();
	} finally {
		current = previous;
	}
}
