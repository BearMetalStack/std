/**
 * @module
 * Declaring which pages a parameterised route produces.
 *
 * A route like `/md/:file` matches an open set of URLs, so the router alone
 * cannot say what to generate. A manifest names the permutations, and takes its
 * parameter typing from the literal route path it is declared under.
 */

import type {
	Manifest,
	ManifestProblem,
	Permutation,
	RouteClassification,
	RouteManifestEntry,
} from "./types.ts";
import { paramsOf } from "./classify.ts";

/**
 * Declare the pages each parameterised route produces.
 *
 * Identity at runtime; it exists for the types. Because the object is captured
 * `const` and each entry is checked against `PathParams` of its own key, a
 * misspelled or missing parameter is a type error at the call site:
 *
 * @example
 * ```ts
 * export default defineManifest({
 *   "/md/:file": {
 *     permutations: () => listMarkdown().map((f) => ({ params: { file: f.slug } })),
 *   },
 *   "/search": {
 *     permutations: [
 *       { params: {}, query: { q: "bears" }, out: "search/bears/index.html" },
 *     ],
 *   },
 * });
 * // { params: { flie: "x" } } -> type error: 'file' is missing
 * ```
 */
export function defineManifest<const M extends Manifest<Extract<keyof M, string>>>(
	manifest: M,
): M {
	return manifest;
}

/** Resolve an entry's permutations, calling and awaiting it when it is a thunk. */
export async function resolvePermutations(
	entry: RouteManifestEntry,
): Promise<Permutation[]> {
	const { permutations } = entry;
	return typeof permutations === "function" ? await permutations() : permutations;
}

/** Substitute `params` into a route pattern, producing a concrete pathname. */
export function fillPath(pattern: string, params: Record<string, unknown>): string {
	return pattern.replace(/:([A-Za-z_$][\w$]*)\??/g, (whole, name: string) => {
		const value = params[name];
		if (value === undefined || value === null) {
			return whole.endsWith("?") ? "" : whole;
		}
		return encodeURIComponent(String(value));
	}).replace(/\/{2,}/g, "/").replace(/(.)\/$/, "$1");
}

/** Append a permutation's query to a pathname. */
export function withQuery(
	pathname: string,
	query: Permutation["query"],
): string {
	if (!query) return pathname;
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (Array.isArray(value)) { for (const v of value) search.append(key, v); }
		else search.append(key, value);
	}
	const qs = search.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Check a manifest against the routes the router actually registered.
 *
 * The types can only see the literal keys, never the live router, so this is
 * where a key that matches no route - or a route left without permutations -
 * gets caught.
 */
export function checkManifest(
	manifest: Manifest | undefined,
	classified: Map<string, RouteClassification>,
): ManifestProblem[] {
	const problems: ManifestProblem[] = [];
	const entries = Object.entries(manifest ?? {});

	for (const [path] of entries) {
		if (!classified.has(path)) {
			problems.push({
				kind: "unknown-route",
				path,
				message:
					`manifest declares "${path}", which is not a registered route. Check the path matches the route exactly, including its parameter names.`,
			});
		}
	}

	for (const route of classified.values()) {
		if (route.class !== "needs-manifest") continue;
		const entry = manifest?.[route.path];
		if (!entry) {
			problems.push({
				kind: "uncovered-route",
				path: route.path,
				message: `"${route.path}" takes parameters (${
					route.params.join(", ")
				}) but has no manifest entry. Add permutations, or set \`skip: true\` to leave it out.`,
			});
		}
	}

	return problems;
}

/** Check one permutation against the parameters its route pattern declares. */
export function checkPermutation(
	pattern: string,
	permutation: Permutation,
): ManifestProblem[] {
	const problems: ManifestProblem[] = [];
	const params = (permutation.params ?? {}) as Record<string, unknown>;

	for (const name of paramsOf(pattern)) {
		const optional = new RegExp(`:${name}\\?`).test(pattern);
		if (optional) continue;
		if (params[name] === undefined || params[name] === null || params[name] === "") {
			problems.push({
				kind: "missing-param",
				path: pattern,
				message: `permutation of "${pattern}" is missing a value for :${name}`,
			});
		}
	}

	if (permutation.query && !permutation.out) {
		problems.push({
			kind: "missing-out",
			path: pattern,
			message:
				`permutation of "${pattern}" sets a query but no \`out\`. A query string has no natural file path, so name the output explicitly.`,
		});
	}

	return problems;
}
