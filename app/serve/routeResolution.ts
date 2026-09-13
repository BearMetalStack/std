/**
 * Turning a matched route path template into `@components`/`@pages`
 * filesystem candidates, in fallback order.
 *
 * The `:param` → `_param` filename convention mirrors the `bearmetal
 * generate route` CLI scaffolder (`bearmetal/generate/route/path.ts`'s
 * `segmentToFileName`), reimplemented here rather than imported from it: that
 * package is unscoped (not `@bearmetal/*`) and a dev-time code generator, not
 * something `@bearmetal/app` should carry as a runtime dependency. Kept in
 * sync by convention and pinned by a test against the same examples.
 *
 * @module
 */

function segmentToCandidate(segment: string): string {
	if (segment === "*") return "_wildcard";
	if (segment.startsWith(":")) return "_" + segment.slice(1);
	return segment;
}

/**
 * Filesystem lookup candidates for a route template, most to least specific.
 *
 * `routeCandidates("/users/:id")` → `["users/_id", "users/main", "main"]`
 * `routeCandidates("/")` → `["main"]`
 */
export function routeCandidates(routeTemplate: string): string[] {
	const segments = routeTemplate.split("/").filter(Boolean).map(segmentToCandidate);
	const candidates: string[] = [];
	if (segments.length > 0) candidates.push(segments.join("/"));
	for (let i = segments.length - 1; i >= 0; i--) {
		candidates.push([...segments.slice(0, i), "main"].join("/"));
	}
	// The loop above only produces a fallback for each segment it can drop -
	// the root path has none to drop, so its one candidate is added directly.
	if (segments.length === 0) candidates.push("main");
	return candidates;
}

/** What resolved for one route. */
export interface RouteResolution {
	/** Winning `@pages` candidate key for this route, e.g. `"users/_id"`. Drives the dispatch `<meta>` tag. */
	page?: string;
	/** Winning `@components` manifest candidate key. Diagnostic only - never changes what ships. */
	componentManifest?: string;
}

/**
 * Resolves `routeTemplate` against the known `@pages` and `@components`
 * manifest candidate keys, applying the same `_id`/`main` fallback chain to
 * each independently.
 */
export function resolveForRoute(
	routeTemplate: string,
	pageKeys: ReadonlySet<string>,
	componentManifestKeys: ReadonlySet<string>,
): RouteResolution {
	const candidates = routeCandidates(routeTemplate);
	return {
		page: candidates.find((c) => pageKeys.has(c)),
		componentManifest: componentManifestKeys.size > 0
			? candidates.find((c) => componentManifestKeys.has(c))
			: undefined,
	};
}
