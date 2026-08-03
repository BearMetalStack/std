// Server rendering of `<Router>`, through the real renderer.
//
// There is no separate server runtime any more, so nothing here is "the server
// version" of anything — these drive the same `Router` a browser does, with the
// URL scoped to the render instead of read off a `location`.
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderToString } from "../../ssr/render.ts";

const fixture = await import("./_server_fixture.tsx");

Deno.test("the render's url picks the route, with no url prop anywhere", async () => {
	assertEquals(await renderToString(fixture.Basic, { url: "/about" }), "<p>about</p>");
	assertEquals(await renderToString(fixture.Basic, { url: "/" }), "<p>home</p>");
});

Deno.test("a full URL works as well as a path", async () => {
	assertEquals(
		await renderToString(fixture.Basic, { url: "https://example.com/about?x=1" }),
		"<p>about</p>",
	);
});

Deno.test("nested routes resolve through <Outlet>", async () => {
	assertEquals(
		await renderToString(fixture.Nested, { url: "/settings/profile" }),
		"<section><p>profile</p></section>",
	);
});

Deno.test("the fallback renders when nothing matches", async () => {
	assertEquals(await renderToString(fixture.Basic, { url: "/nope" }), "<p>404</p>");
});

Deno.test("a url prop on the router still wins over the render's", async () => {
	assertEquals(await renderToString(fixture.Pinned, { url: "/about" }), "<p>home</p>");
});

Deno.test("rendering without a url produces nothing rather than guessing", async () => {
	// Falling back to `/` looks harmless and is the worst available behaviour:
	// every non-root URL server-renders the *wrong* route, which the client then
	// tears out and replaces on hydration — a visible flash of the wrong page,
	// plus a full mount/unmount cycle for components that should never have
	// rendered at all.
	const warn = console.warn;
	const warnings: string[] = [];
	console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
	let markup: string;
	try {
		markup = await renderToString(fixture.Basic);
	} finally {
		console.warn = warn;
	}

	assertEquals(markup, "", "no url means no match, not a match against `/`");
	assertEquals(warnings.length, 1);
	assertStringIncludes(warnings[0], "renderToString(view, { url: ctx.request.url })");
});
