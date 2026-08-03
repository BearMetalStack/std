/**
 * `location` and `history`.
 *
 * A server has a URL per request, not per process, so these exist to give
 * client code something to read rather than to be a source of truth. Anything
 * that has to be *correct* per request — which routing does — should be handed
 * the URL explicitly; see `renderToString` in `@bearmetal/app/ssr`, which scopes
 * it to one synchronous render instead.
 *
 * What they buy is that navigation-aware code stops crashing: a component that
 * reads `location.pathname` at mount, or calls `history.pushState`, runs
 * server-side and in tests without a `typeof location !== "undefined"` guard
 * around every access.
 */

const DEFAULT_HREF = "http://localhost/";

/** The `location` global: a `URL`, plus the mutators that navigate. */
export class SlagLocation {
	#url: URL;
	#onNavigate?: (href: string) => void;

	constructor(href: string | URL = DEFAULT_HREF, onNavigate?: (href: string) => void) {
		this.#url = new URL(href);
		this.#onNavigate = onNavigate;
	}

	get href(): string {
		return this.#url.href;
	}

	set href(value: string) {
		this.assign(value);
	}

	get origin(): string {
		return this.#url.origin;
	}
	get protocol(): string {
		return this.#url.protocol;
	}
	get host(): string {
		return this.#url.host;
	}
	get hostname(): string {
		return this.#url.hostname;
	}
	get port(): string {
		return this.#url.port;
	}
	get pathname(): string {
		return this.#url.pathname;
	}
	get search(): string {
		return this.#url.search;
	}
	get hash(): string {
		return this.#url.hash;
	}

	/** Navigates, resolving `url` against the current one. No page load happens. */
	assign(url: string | URL): void {
		this.#url = new URL(url, this.#url);
		this.#onNavigate?.(this.#url.href);
	}

	replace(url: string | URL): void {
		this.assign(url);
	}

	reload(): void {}

	toString(): string {
		return this.#url.href;
	}
}

/** One entry in {@linkcode SlagHistory}. */
interface HistoryEntry {
	state: unknown;
	href: string;
}

/**
 * The `history` global.
 *
 * A real stack, so `pushState`/`back()` behave; the URL it moves is
 * {@linkcode SlagLocation}'s. It fires no `popstate` of its own — the window
 * owns event dispatch, and wires that up when it installs these.
 */
export class SlagHistory {
	#entries: HistoryEntry[];
	#index = 0;
	#location: SlagLocation;
	#onPop?: (state: unknown) => void;

	constructor(location: SlagLocation, onPop?: (state: unknown) => void) {
		this.#location = location;
		this.#entries = [{ state: null, href: location.href }];
		this.#onPop = onPop;
	}

	get length(): number {
		return this.#entries.length;
	}

	get state(): unknown {
		return this.#entries[this.#index]?.state ?? null;
	}

	get scrollRestoration(): "auto" | "manual" {
		return "auto";
	}

	pushState(state: unknown, _title: string, url?: string | URL | null): void {
		if (url != null) this.#location.assign(url);
		this.#entries.length = this.#index + 1;
		this.#entries.push({ state, href: this.#location.href });
		this.#index = this.#entries.length - 1;
	}

	replaceState(state: unknown, _title: string, url?: string | URL | null): void {
		if (url != null) this.#location.assign(url);
		this.#entries[this.#index] = { state, href: this.#location.href };
	}

	go(delta = 0): void {
		const next = this.#index + delta;
		if (next < 0 || next >= this.#entries.length) return;
		this.#index = next;
		const entry = this.#entries[next];
		this.#location.assign(entry.href);
		this.#onPop?.(entry.state);
	}

	back(): void {
		this.go(-1);
	}

	forward(): void {
		this.go(1);
	}
}
