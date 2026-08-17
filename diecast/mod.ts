/**
 * @module
 * Static site generation for the BearMetal router.
 *
 * The router is already a renderer: after mounting it holds a flat table of
 * every route in the app, and `Router.handler` dispatches a `Request` without a
 * server in front of it. Diecast enumerates that table, renders each page
 * through the same code path a live request takes, and writes the result to
 * disk.
 *
 * @example
 * ```ts
 * import { defineSite, runDiecast } from "@bearmetal/diecast";
 * import { router } from "./app.ts";
 * import manifest from "./diecast.manifest.ts";
 *
 * export const site = defineSite({ router, manifest, outDir: "dist" });
 *
 * if (import.meta.main) await runDiecast(site);
 * ```
 */

export { diecast } from "./generate.ts";
export { classifyRoutes, manifestSkeleton, paramsOf, routesOfClass } from "./classify.ts";
export {
	checkManifest,
	checkPermutation,
	defineManifest,
	fillPath,
	resolvePermutations,
	withQuery,
} from "./manifest.ts";
export { defineSite, printReport, printSuggestions, runDiecast } from "./site.ts";
export { diecastModule } from "./module.ts";
export type { DiecastModuleOptions } from "./module.ts";
export {
	extensionFor,
	isHtml,
	normalizeContentType,
	outputPathFor,
	redirectShim,
	writeResponse,
} from "./write.ts";
export { discoverFrom, extractReferences, inlineModuleImports } from "./discover.ts";
export type { PageReferences } from "./discover.ts";

export type * from "./types.ts";
