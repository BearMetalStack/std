/**
 * Telling a browser apart from a server.
 *
 * `typeof document !== "undefined"` used to answer this, and no longer can:
 * a server render has a `document` — that is the entire point of the microdom,
 * and what lets one component render on both sides. The absence of `Deno` is
 * what distinguishes them now. The client bundle runs in a browser, and nothing
 * else in this stack runs anywhere but Deno.
 *
 * Reach for this only for things that are genuinely browser-only: attaching
 * listeners to a document that will be discarded, patching `history`, starting
 * timers. Rendering is not one of them — that is supposed to be identical.
 */
export function isBrowser(): boolean {
	return typeof document !== "undefined" && !("Deno" in globalThis);
}
