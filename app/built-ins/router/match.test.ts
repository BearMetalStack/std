import { assert, assertEquals } from "@std/assert";
import {
	flattenRoutes,
	isActivePath,
	isRouteDescriptor,
	matchRoutes,
	ROUTE,
	type RouteDescriptor,
} from "./match.ts";

function route(path: string, children: RouteDescriptor[] = []): RouteDescriptor {
	return { [ROUTE]: true, path, render: () => null, children, meta: {} };
}

/** A route that only contributes a path segment — no renderer of its own. */
function prefix(path: string, children: RouteDescriptor[]): RouteDescriptor {
	return { [ROUTE]: true, path, render: undefined, children, meta: {} };
}

function patterns(routes: RouteDescriptor[], base = "/"): string[] {
	return flattenRoutes(routes, base).map((c) => c.pattern);
}

function match(routes: RouteDescriptor[], pathname: string, base = "/") {
	return matchRoutes(flattenRoutes(routes, base), new URL(pathname, "http://localhost"));
}

Deno.test("isRouteDescriptor recognises descriptors and nothing else", () => {
	assert(isRouteDescriptor(route("/")));
	assert(!isRouteDescriptor({ path: "/" }));
	assert(!isRouteDescriptor(null));
});

Deno.test("flattenRoutes joins nested paths", () => {
	assertEquals(
		patterns([route("/settings", [route("/profile"), route("/billing")])]),
		["/settings/profile", "/settings/billing", "/settings"],
	);
});

Deno.test("flattenRoutes puts children before the parent's own chain", () => {
	// Otherwise a parent that can render alone would shadow every child.
	const chains = patterns([route("/docs", [route("/intro")])]);
	assertEquals(chains.indexOf("/docs/intro") < chains.indexOf("/docs"), true);
});

Deno.test("an index child resolves to the parent's own path", () => {
	assertEquals(patterns([route("/settings", [route("/")])]), ["/settings", "/settings"]);
	const hit = match([route("/settings", [route("/")])], "/settings");
	assertEquals(hit?.routes.length, 2, "the index child should win over the parent alone");
});

Deno.test("a route with children but no renderer is a bare prefix", () => {
	assertEquals(patterns([prefix("/api", [route("/v1")])]), ["/api/v1"]);
});

Deno.test("flattenRoutes honours the base path", () => {
	assertEquals(patterns([route("/users")], "/app"), ["/app/users"]);
});

Deno.test("a wildcard parent's children keep their own segment", () => {
	// `joinPath` treats a preceding `*` as something to pop, so the wildcard has
	// to be stripped before joining or the child segment vanishes.
	assertEquals(
		patterns([route("/docs/*", [route("/intro")])]),
		["/docs/intro", "/docs/*"],
	);
});

Deno.test("matchRoutes returns the first matching chain", () => {
	const routes = [route("/users/:id"), route("/users/new")];
	assertEquals(match(routes, "/users/new")?.pattern, "/users/:id");
});

Deno.test("matchRoutes merges params across the whole chain", () => {
	const routes = [route("/orgs/:org", [route("/repos/:repo")])];
	assertEquals(match(routes, "/orgs/bearmetal/repos/app")?.params, {
		org: "bearmetal",
		repo: "app",
	});
});

Deno.test("matchRoutes returns null when nothing matches", () => {
	assertEquals(match([route("/a")], "/b"), null);
});

Deno.test("a trailing wildcard also matches its bare prefix", () => {
	assertEquals(match([route("/docs/*")], "/docs")?.pattern, "/docs/*");
	assertEquals(match([route("/docs/*")], "/docs/a/b")?.pattern, "/docs/*");
});

Deno.test("an unparseable path warns instead of throwing, and never matches", () => {
	const warn = console.warn;
	const warnings: unknown[] = [];
	console.warn = (...args) => warnings.push(args);
	try {
		assertEquals(match([route("/:")], "/x"), null);
	} finally {
		console.warn = warn;
	}
	assertEquals(warnings.length, 1);
});

Deno.test("isActivePath matches a section by default", () => {
	assert(isActivePath("/settings", "/settings"));
	assert(isActivePath("/settings", "/settings/profile"));
	assert(!isActivePath("/settings", "/settings-other"));
	assert(!isActivePath("/settings", "/"));
});

Deno.test("isActivePath in exact mode matches only the path itself", () => {
	assert(isActivePath("/settings", "/settings", true));
	assert(!isActivePath("/settings", "/settings/profile", true));
});

Deno.test("isActivePath treats the root as exact, so it is not active everywhere", () => {
	assert(isActivePath("/", "/"));
	assert(!isActivePath("/", "/anything"));
});

Deno.test("isActivePath ignores a trailing slash", () => {
	assert(isActivePath("/settings/", "/settings"));
	assert(isActivePath("/settings", "/settings/"));
});
