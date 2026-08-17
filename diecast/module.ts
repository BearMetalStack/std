/**
 * @module
 * Snapshotting pages to disk as they are served.
 *
 * The build-time generator renders a whole site up front. This renders it a
 * page at a time, as real traffic arrives, which suits a site whose pages are
 * too many or too slow to enumerate.
 */

import { Module } from "@bearmetal/router";
import { isHtml, writeResponse } from "./write.ts";
import type { OutputStyle } from "./types.ts";

export type DiecastModuleOptions = {
	/** Directory to snapshot into. */
	outDir: string;
	/** Default `"index"`, matching the build-time generator. */
	outputStyle?: OutputStyle;
	/**
	 * Snapshot every successful response, not only HTML. Useful when the app
	 * serves generated assets that a static host would otherwise never see.
	 */
	allContentTypes?: boolean;
	/** Paths to leave alone. A string is compiled to a `URLPattern`. */
	ignore?: (string | URLPattern)[];
	/** Called when a snapshot fails, which is otherwise silent. */
	onError?: (error: unknown, url: URL) => void;
};

/**
 * A module that writes each page it serves to disk.
 *
 * **Mount it before the routes it should capture.** The middleware chain is
 * assembled by walking matching routes in the root's insertion order, so a
 * catch-all registered after a page route runs after that route's handler has
 * already returned.
 *
 * Writes are deliberately not awaited: a snapshot is a side effect of serving
 * the page, and should never add latency to the response.
 *
 * @example
 * ```ts
 * const app = new Router()
 *   .use(diecastModule({ outDir: "dist" }))  // before the page routes
 *   .use(pages());
 * ```
 */
export function diecastModule(opts: DiecastModuleOptions): Module {
	const outputStyle = opts.outputStyle ?? "index";
	// `{ pathname }` rather than the string form, which `URLPattern` rejects
	// without a base URL. This is how the router compiles its own routes.
	const ignore = (opts.ignore ?? []).map((p) =>
		p instanceof URLPattern ? p : new URLPattern({ pathname: p })
	);

	const mod = new Module();
	mod.route("/.*").get(async (ctx, next) => {
		const res = await next();

		if (ignore.some((p) => p.test(ctx.url))) return res;
		if (res.status !== 200) return res;
		if (!opts.allContentTypes && !isHtml(res.headers.get("content-type"))) return res;

		// A Response body is a single-use stream, so the snapshot gets the copy
		// and the caller keeps the original.
		const snapshot = res.clone();
		writeResponse(snapshot, ctx.url, { outDir: opts.outDir, outputStyle })
			.catch((error) => opts.onError?.(error, ctx.url));

		return res;
	});
	return mod;
}
