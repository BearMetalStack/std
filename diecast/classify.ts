/**
 * @module
 * Deciding, from the router's own route table, which routes can be generated
 * without help and which need permutations declared in a manifest.
 */

import { _use, type AnyModule } from "@bearmetal/router";
import type { RouteClass, RouteClassification } from "./types.ts";

/** Routes the router reserves for its own tooling, never part of a static site. */
const RESERVED = /^\/@bearmetal(\/|$)/;

/**
 * Patterns that match effectively everything. These are how `Router.use(fn)` and
 * a bare `Router.get(fn)` register middleware, so they carry handlers but
 * correspond to no single page.
 */
const CATCH_ALL = new Set(["/.*", "/*", "*", "/(.*)"]);

/** `:name` and `:name?`, the only parameter syntax a manifest can fill in. */
const NAMED_PARAM = /:([A-Za-z_$][\w$]*)\??/g;

/**
 * Syntax that makes a path a pattern rather than a literal. Covers named
 * parameters, wildcards, optional groups and inline regex.
 */
const IS_PATTERN = /[:*?{}()[\]+]|\\d|\\w/;

/** Names of the `:param` segments a path declares, in order of appearance. */
export function paramsOf(path: string): string[] {
	return [...path.matchAll(NAMED_PARAM)].map((m) => m[1]);
}

/**
 * True when a path is a `serveDirectory` mount - those are registered as
 * `root + "*"` and are copied from disk rather than rendered.
 */
function isDirectoryMount(path: string): boolean {
	return path.endsWith("*") && !path.endsWith("(.*)");
}

function classifyOne(path: string, methods: readonly string[]): RouteClassification {
	const params = paramsOf(path);
	const skip = (reason: string): RouteClassification => ({
		path,
		class: "skip" satisfies RouteClass,
		reason,
		params,
	});

	if (!methods.includes("GET")) {
		// Middleware-only routes register no method at all and land here too.
		return skip(
			methods.length === 0 ? "middleware only" : `no GET handler (${methods.join(", ")})`,
		);
	}
	if (CATCH_ALL.has(path)) return skip("catch-all pattern");
	if (RESERVED.test(path)) return skip("reserved @bearmetal namespace");
	if (isDirectoryMount(path)) return skip("served directory");
	if (params.length > 0) {
		return { path, class: "needs-manifest", params };
	}
	if (IS_PATTERN.test(path)) {
		// Wildcards and regex groups match a set diecast cannot enumerate, and a
		// manifest cannot name the groups either.
		return skip("unnameable pattern");
	}
	return { path, class: "static", params };
}

/**
 * Classify every route registered on `router`.
 *
 * After mounting, the root holds every route in the app at its fully-prefixed
 * path - sub-modules are flattened into it at `use()` time, so there is no tree
 * to walk.
 *
 * @example
 * ```ts
 * for (const [path, entry] of classifyRoutes(router)) {
 *   if (entry.class === "needs-manifest") console.log(path, entry.params);
 * }
 * ```
 */
export function classifyRoutes(router: AnyModule): Map<string, RouteClassification> {
	const out = new Map<string, RouteClassification>();
	for (const [path, config] of router.rawRoutes) {
		// `rawRoutes` rather than `routeRegistry` because it is the member the
		// structural `AnyModule` interface guarantees, so a Module built against
		// another copy of the package still works here.
		const methods = Object.keys(config.handlers).filter((m) => m !== _use);
		out.set(path, classifyOne(path, methods));
	}
	return out;
}

/** The classifications of one class, in sorted path order. */
export function routesOfClass(
	classified: Map<string, RouteClassification>,
	cls: RouteClass,
): RouteClassification[] {
	return [...classified.values()]
		.filter((c) => c.class === cls)
		.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * A `defineManifest` call covering every route that needs one, ready to paste
 * into a project's `diecast.manifest.ts`.
 */
export function manifestSkeleton(classified: Map<string, RouteClassification>): string {
	const needs = routesOfClass(classified, "needs-manifest");
	if (needs.length === 0) {
		return `import { defineManifest } from "@bearmetal/diecast/manifest";\n\n` +
			`export default defineManifest({});\n`;
	}

	const entries = needs.map((route) => {
		const params = route.params.map((p) => `${p}: ""`).join(", ");
		return `\t${JSON.stringify(route.path)}: {\n` +
			`\t\tpermutations: [\n` +
			`\t\t\t{ params: { ${params} } },\n` +
			`\t\t],\n` +
			`\t},`;
	}).join("\n");

	return `import { defineManifest } from "@bearmetal/diecast/manifest";\n\n` +
		`export default defineManifest({\n${entries}\n});\n`;
}
