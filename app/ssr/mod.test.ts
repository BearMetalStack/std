// `Layout`/`Page` head delivery: `contributeHead()`/`contributeRouteHead()`
// output must reach the response whenever a `Layout` is in play, regardless
// of whether the layout's own JSX happens to include a literal `<head>`.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assert, assertEquals, assertMatch } from "@std/assert";
import type { RouterContext, StateType } from "@bearmetal/router";
import { contributeHead, contributeRouteHead } from "./head.ts";
import { Layout, Page } from "./mod.ts";

const fixture = await import("./_mod_fixture.tsx");
const headFixture = await import("./_head_fixture.tsx");

function fakeCtx(routePath?: string): RouterContext<StateType> {
	return {
		url: new URL("http://localhost/"),
		params: {},
		state: {},
		request: new Request("http://localhost/"),
		body: "",
		query: {},
		getService: () => {
			throw new Error("not used by these tests");
		},
		connection: {} as Deno.ServeHandlerInfo<Deno.Addr>,
		cookies: new Map(),
		route: routePath
			? { path: routePath, pattern: new URLPattern({ pathname: routePath }) }
			: undefined,
	};
}

const noop = () => Promise.resolve(new Response());

Deno.test("Page with a Layout that renders <head> appends head contributions there", async () => {
	const ctx = fakeCtx();
	await Layout(fixture.layoutWithHead)(ctx, noop);
	const unregister = contributeHead(() => headFixture.meta("test", "a"));
	try {
		const res = await Page(fixture.simpleView)(ctx, noop);
		const html = await res.text();
		assertMatch(html, /<head>[\s\S]*<meta name="test" content="a">[\s\S]*<\/head>/);
		assertMatch(html, /^<!DOCTYPE html>/);
	} finally {
		unregister();
	}
});

Deno.test("Page with a Layout that omits <head> synthesizes one and still delivers contributions", async () => {
	const ctx = fakeCtx();
	await Layout(fixture.layoutWithoutHead)(ctx, noop);
	const unregister = contributeHead(() => headFixture.meta("test", "b"));
	try {
		const res = await Page(fixture.simpleView)(ctx, noop);
		const html = await res.text();
		assertMatch(html, /<head><meta name="test" content="b"><\/head>/);
	} finally {
		unregister();
	}
});

Deno.test("Page without a Layout renders a bare fragment and never touches <head>", async () => {
	const ctx = fakeCtx();
	const res = await Page(fixture.simpleView)(ctx, noop);
	const html = await res.text();
	assert(!html.includes("<!DOCTYPE"));
	assert(!html.includes("<head"));
});

Deno.test("contributeRouteHead only fires for Layout-rendered pages, and receives the matched route", async () => {
	let seenRoute: string | undefined | "not called" = "not called";
	const unregister = contributeRouteHead((route) => {
		seenRoute = route;
		return null;
	});
	try {
		seenRoute = "not called";
		await Page(fixture.simpleView)(fakeCtx("/users/:id"), noop);
		assertEquals(seenRoute, "not called");

		const ctx = fakeCtx("/users/:id");
		await Layout(fixture.layoutWithHead)(ctx, noop);
		await Page(fixture.simpleView)(ctx, noop);
		assertEquals(seenRoute, "/users/:id");
	} finally {
		unregister();
	}
});
