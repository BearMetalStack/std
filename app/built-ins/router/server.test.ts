// No DOM is installed here on purpose: `@bearmetal/jsx/jsx-runtime` picks its
// server half from `typeof document` at import time, so this file exercises the
// side of `<Router>`/`<Route>` that server rendering takes. That side is
// genuinely different — the server runtime is `async`, so nested `<Route>`
// elements arrive as promises rather than as descriptors.
import { assertEquals, assertStringIncludes } from "@std/assert";
import { Html } from "@bearmetal/jsx";
import { jsx } from "@bearmetal/jsx/server/jsx-runtime";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Outlet, Route, Router } from "./Router.ts";

const html = (markup: string) => new Html(markup) as unknown as JSX.Element;

/** `<Route>` as the server JSX runtime invokes it: through `jsx`, awaited. */
function route(props: Parameters<typeof Route>[0]) {
	return jsx(Route as (p: Record<string, unknown>) => never, props as Record<string, unknown>);
}

async function render(props: Parameters<typeof Router>[0]): Promise<string> {
	const out = await (Router(props) as unknown as Promise<{ toString(): string } | null>);
	return out == null ? "" : String(out);
}

Deno.test("the server renders the route matching the url prop", async () => {
	const markup = await render({
		url: "/about",
		children: [
			route({ path: "/", children: () => html("<p>home</p>") }),
			route({ path: "/about", children: () => html("<p>about</p>") }),
		],
	});
	assertEquals(markup, "<p>about</p>");
});

Deno.test("nested routes resolve through <Outlet> on the server", async () => {
	const markup = await render({
		url: "/settings/profile",
		children: [
			route({
				path: "/settings",
				children: [
					async () => html(`<section>${await Outlet()}</section>`),
					route({ path: "/profile", children: () => html("<p>profile</p>") }),
				],
			}),
		],
	});
	assertEquals(markup, "<section><p>profile</p></section>");
});

Deno.test("a full URL works as well as a path", async () => {
	const markup = await render({
		url: "https://example.com/about?x=1",
		children: [route({ path: "/about", children: () => html("<p>about</p>") })],
	});
	assertEquals(markup, "<p>about</p>");
});

Deno.test("the fallback renders when nothing matches", async () => {
	const markup = await render({
		url: "/nope",
		children: [route({ path: "/", children: () => html("<p>home</p>") })],
		fallback: () => html("<p>404</p>"),
	});
	assertEquals(markup, "<p>404</p>");
});

Deno.test("rendering without a url warns, because the match would be a guess", async () => {
	const warn = console.warn;
	const warnings: string[] = [];
	console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
	try {
		await render({ children: [route({ path: "/", children: () => html("<p>home</p>") })] });
	} finally {
		console.warn = warn;
	}
	assertEquals(warnings.length, 1);
	assertStringIncludes(warnings[0], "<Router url={ctx.request.url}>");
});
