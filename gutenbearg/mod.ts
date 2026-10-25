/**
 * @module
 * Gutenbearg: documentation sites for BearMetal.
 *
 * A site is a directory of markdown — `.bearmetal/gutenbearg` by default — where the file system
 * is the only manifest: `0016-` prefixes order pages, `[icon]` in a section's name gives its icon,
 * and version directories inherit from the ones before them. Templates render each kind of page —
 * home, doc, changelog, 404/draft — inside one of three shells, and {@linkcode gutenbeargModule}
 * serves the lot from the router.
 *
 * @example
 * ```ts
 * import { Router } from "@bearmetal/router";
 * import { gutenbeargModule } from "@bearmetal/gutenbearg";
 *
 * const router = new Router();
 * router.use(await gutenbeargModule({ watch: true }));
 * Deno.serve(router.handle);
 * ```
 */

export { gutenbeargModule, reportDiagnostics } from "./module.tsx";
export type { GutenbeargOptions, RequestChoices } from "./module.tsx";
export { ContentLoader, DEFAULT_DIR, loadContent } from "./content/load.ts";
export type { LoadOptions } from "./content/load.ts";
export { renderTree } from "./content/render.tsx";
export type { RenderEnv } from "./content/render.tsx";
export * from "./content/names.ts";
export {
	firstPage,
	href,
	latestPages,
	nearby,
	packageRoute,
	pagesOf,
	prevNext,
	sectionOf,
	sectionsOf,
	slugify,
	toneOf,
} from "./site.ts";
export { buildSprite, ICONS } from "./icons.ts";
export * from "./templates/mod.ts";
export * from "./blocks/mod.tsx";
export type * from "./types.ts";
