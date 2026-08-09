/**
 * The router's single source of truth for "where are we".
 *
 * Everything reactive in the router hangs off one `Signal.State<string>` holding
 * the current href. It is created lazily on first read so that importing the
 * router never touches `history`/`location` — which matters both for SSR and for
 * tests running under a microdom that has a `document` but no navigation APIs.
 */

import { Signal } from "../../signals/wrapper.ts";

/**
 * Whether a DOM is present. Read lazily rather than captured at module scope so
 * a test that installs a microdom after import still takes the client path.
 */
function hasDocument(): boolean {
	return typeof document !== "undefined";
}

const FALLBACK_HREF = "http://localhost/";

let state: Signal.State<string> | undefined;
let href = FALLBACK_HREF;
let hooked = false;

/** Marks `history` as already patched, across separately bundled copies of this module. */
const HISTORY_HOOKED: unique symbol = Symbol.for("bearmetal.router.historyHooked");

/**
 * The reactive current URL, as an href string.
 *
 * Strings rather than `URL` objects: `Signal.State` compares with `===`, and a
 * fresh `URL` is never equal to the last one, so every sync would notify even
 * when the location did not actually change.
 */
export function urlSignal(): Signal.State<string> {
	if (!state) {
		href = globalThis.location?.href ?? FALLBACK_HREF;
		state = new Signal.State(href);
		installHistoryHooks();
	}
	return state;
}

/**
 * The current href, read without subscribing to it.
 *
 * The signal is the source of truth even where a `location` exists — `location`
 * is only ever an *input* to it, pushed in by {@linkcode syncUrl}. Resolving
 * relative navigation against `location` instead would silently ignore anything
 * the host had set through {@linkcode setUrl}.
 */
export function currentHref(): string {
	return state ? href : globalThis.location?.href ?? FALLBACK_HREF;
}

const subscribers = new Set<(href: string) => void>();

/**
 * Calls `fn` whenever the URL changes, outside any reactive computation.
 *
 * This exists because the signal graph will not let an effect be the thing that
 * writes: a `Signal.State.set()` performed inside an effect updates the value
 * but never notifies anything else reading it, so state derived from the URL by
 * an effect silently goes stale. Every call into `commit` originates in a DOM
 * event, a history hook or an explicit `navigate()` — never a reactive
 * computation — so a subscriber may safely write signals.
 */
export function subscribeToUrl(fn: (href: string) => void): () => void {
	urlSignal();
	subscribers.add(fn);
	return () => subscribers.delete(fn);
}

function commit(next: string): void {
	if (next === href) return;
	href = next;
	state?.set(next);
	for (const fn of [...subscribers]) fn(next);
}

/** Pulls the live `location` back into the signal. Idempotent, and a no-op without one. */
export function syncUrl(): void {
	if (globalThis.location) commit(globalThis.location.href);
}

/**
 * Overrides the current URL without touching `history`.
 *
 * The seam for tests and for driving the router from a non-browser host. In a
 * browser the next `popstate`/`pushState` will overwrite whatever is set here.
 */
export function setUrl(value: string | URL): void {
	urlSignal();
	commit(new URL(value, currentHref()).href);
}

/**
 * Teaches the URL signal about navigations it did not initiate.
 *
 * `popstate` and `hashchange` are plain listeners. `pushState`/`replaceState`
 * are patched because they fire no event at all, so imperative navigation from
 * anywhere in the app — including code that predates this router — would
 * otherwise leave the signal stale.
 */
function installHistoryHooks(): void {
	if (hooked || !hasDocument()) return;
	hooked = true;

	globalThis.addEventListener?.("popstate", syncUrl);
	globalThis.addEventListener?.("hashchange", syncUrl);

	const history = globalThis.history as
		| (History & { [HISTORY_HOOKED]?: boolean })
		| undefined;
	if (!history?.pushState || history[HISTORY_HOOKED]) return;
	history[HISTORY_HOOKED] = true;

	for (const name of ["pushState", "replaceState"] as const) {
		const original = history[name].bind(history);
		history[name] = (...args: Parameters<History["pushState"]>) => {
			original(...args);
			syncUrl();
		};
	}
}

/** Options for {@linkcode navigate}. */
export interface NavigateOptions {
	/** Replace the current history entry instead of pushing a new one. */
	replace?: boolean;
	/** Value stored as the history entry's state. */
	state?: unknown;
}

/**
 * Navigates to `to`, resolved against the current URL.
 *
 * This is the sanctioned way to move around: it updates history and the URL
 * signal together. Without a `history` (SSR, tests) it just moves the signal.
 *
 * @example
 * ```ts
 * navigate("/users/42");
 * navigate("?tab=settings", { replace: true });
 * ```
 */
export function navigate(to: string | URL, options: NavigateOptions = {}): void {
	urlSignal();
	const target = new URL(to, currentHref()).href;

	const history = globalThis.history;
	if (history?.pushState) {
		if (options.replace) history.replaceState(options.state ?? null, "", target);
		else history.pushState(options.state ?? null, "", target);
		syncUrl();
		return;
	}

	commit(target);
}

let removeInterceptor: (() => void) | undefined;
let interceptorRefs = 0;

/**
 * Routes same-document anchor clicks through {@linkcode navigate} instead of a
 * full page load.
 *
 * Deliberately conservative — a click is only intercepted when the browser
 * would have done a plain same-origin navigation anyway. Modified clicks,
 * non-primary buttons, `target`, `download`, `rel="external"`, cross-origin
 * hrefs and same-page hash jumps are all left alone, so "open in new tab",
 * file downloads and in-page anchors keep working.
 *
 * Reference counted: the returned function undoes one call, and the listener is
 * removed once every caller has released it.
 */
export function interceptLinkClicks(): () => void {
	if (!hasDocument()) return () => {};

	interceptorRefs++;
	if (!removeInterceptor) {
		const onClick = (event: Event) => handleClick(event as MouseEvent);
		document.addEventListener("click", onClick);
		removeInterceptor = () => document.removeEventListener("click", onClick);
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (--interceptorRefs > 0) return;
		removeInterceptor?.();
		removeInterceptor = undefined;
	};
}

function handleClick(event: MouseEvent): void {
	if (event.defaultPrevented) return;
	if (event.button > 0) return;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

	const target = event.target;
	if (!target || typeof (target as Element).closest !== "function") return;
	const anchor = (target as Element).closest("a");
	if (!anchor) return;

	const href = anchor.getAttribute("href");
	if (href == null || href === "") return;
	if (anchor.hasAttribute("download")) return;
	if (anchor.getAttribute("rel")?.split(/\s+/).includes("external")) return;

	const linkTarget = anchor.getAttribute("target");
	if (linkTarget && linkTarget !== "_self") return;

	const current = new URL(currentHref());
	let url: URL;
	try {
		url = new URL(href, current);
	} catch {
		return;
	}
	if (url.origin !== current.origin) return;

	if (url.pathname === current.pathname && url.search === current.search && url.hash !== "") {
		return;
	}

	event.preventDefault();
	navigate(url);
}

/**
 * Drops all module state. Test-only: leaves the history patch in place, since
 * it is keyed to the `history` object rather than to this module.
 */
export function resetLocationState(): void {
	state = undefined;
	href = FALLBACK_HREF;
	hooked = false;
	removeInterceptor?.();
	removeInterceptor = undefined;
	interceptorRefs = 0;
}
