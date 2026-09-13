import { assertEquals } from "@std/assert";
import { resolveForRoute, routeCandidates } from "./routeResolution.ts";

Deno.test("routeCandidates for a single dynamic segment", () => {
	assertEquals(routeCandidates("/users/:id"), ["users/_id", "users/main", "main"]);
});

Deno.test("routeCandidates for the root route", () => {
	assertEquals(routeCandidates("/"), ["main"]);
});

Deno.test("routeCandidates for a static, multi-segment route", () => {
	assertEquals(routeCandidates("/users/profile"), ["users/profile", "users/main", "main"]);
});

Deno.test("routeCandidates mixes static, dynamic, and wildcard segments, matching the :id -> _id, * -> _wildcard convention", () => {
	assertEquals(routeCandidates("/a/b/:c/*"), [
		"a/b/_c/_wildcard",
		"a/b/_c/main",
		"a/b/main",
		"a/main",
		"main",
	]);
});

Deno.test("resolveForRoute picks the most specific existing page and manifest candidate", () => {
	const pageKeys = new Set(["users/_id", "main"]);
	const componentManifestKeys = new Set(["main"]);

	assertEquals(
		resolveForRoute("/users/:id", pageKeys, componentManifestKeys),
		{ page: "users/_id", componentManifest: "main" },
	);
});

Deno.test("resolveForRoute falls back to main when no specific candidate exists", () => {
	const pageKeys = new Set(["main"]);
	const componentManifestKeys = new Set(["main"]);

	assertEquals(
		resolveForRoute("/users/:id", pageKeys, componentManifestKeys),
		{ page: "main", componentManifest: "main" },
	);
});

Deno.test("resolveForRoute leaves page undefined when nothing resolves, including no main", () => {
	const pageKeys = new Set<string>();
	const componentManifestKeys = new Set<string>();

	assertEquals(
		resolveForRoute("/users/:id", pageKeys, componentManifestKeys),
		{ page: undefined, componentManifest: undefined },
	);
});

Deno.test("resolveForRoute treats an empty componentManifestKeys set as no manifests exist at all, not unresolved", () => {
	const pageKeys = new Set<string>();
	const componentManifestKeys = new Set<string>();

	const resolution = resolveForRoute("/users/:id", pageKeys, componentManifestKeys);
	assertEquals(resolution.componentManifest, undefined);
});
