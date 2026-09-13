/**
 * Client-side dispatch for `@pages` files.
 *
 * A `@pages/<candidate>.ts` file is a plain module - importable like any
 * other, typically pulling in a shared store from `@app/` - that registers
 * an init function under its route candidate key at module scope, mirroring
 * how `@define` self-registers a custom element tag. Every `@pages` file is
 * bundled unconditionally (nothing else naturally imports one), so by the
 * time {@linkcode dispatch} runs - the last statement of the synthesized
 * bundle entry `@bearmetal/app/serve` builds - every registration has
 * already happened.
 *
 * The server resolves which candidate applies to the route currently
 * rendering (see `@bearmetal/app/serve`'s `resolveForRoute`) and embeds that
 * winning key into the page; {@linkcode dispatch} does a plain lookup against
 * it, no fallback logic needed in the browser.
 *
 * @module
 */

const registry = new Map<string, () => void>();

/** Registers `init` to run when this page's route resolves to `key`. */
export function registerPage(key: string, init: () => void): void {
	registry.set(key, init);
}

/**
 * Looks up the page key the server embedded (`<meta name="bm-page">`) and
 * calls its registered init function, if any.
 */
export function dispatch(): void {
	const key = document.querySelector('meta[name="bm-page"]')?.getAttribute("content");
	if (key) registry.get(key)?.();
}
