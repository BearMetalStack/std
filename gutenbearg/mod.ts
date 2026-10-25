/**
 * @module
 * Gutenbearg: documentation sites for BearMetal.
 *
 * A site is a {@linkcode SiteConfig} (navigation, packages, versions, glossary) plus content per
 * route. Templates render each kind of page — home, doc, changelog, 404/draft — inside one of
 * three shells, and {@linkcode gutenbeargModule} serves the lot from the router.
 *
 * @example
 * ```ts
 * import { Router } from "@bearmetal/router";
 * import { gutenbeargModule } from "@bearmetal/gutenbearg";
 * import { content } from "./content/mod.ts";
 *
 * const router = new Router();
 * router.use(gutenbeargModule(content));
 * Deno.serve(router.handle);
 * ```
 */

export { gutenbeargModule } from "./module.tsx";
export type { GutenbeargOptions, RequestChoices } from "./module.tsx";
export { allPages, findPage, href, nearby, prevNext, routeOf, slugify, toneOf } from "./site.ts";
export { ICONS } from "./icons.ts";
export * from "./templates/mod.ts";
export * from "./blocks/mod.tsx";
export type * from "./types.ts";
