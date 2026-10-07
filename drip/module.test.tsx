import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Router } from "@bearmetal/router";
import { Layout, Page } from "@bearmetal/app/ssr";
import { BMDripBase, themeSelection } from "./ssr.tsx";
import { dripModule, type DripModuleOptions } from "./module.ts";
import type { ThemeCatalog } from "./selection.ts";

function app(options: DripModuleOptions = { themes: ["bearmetal", "pride"] }) {
	const router = new Router();
	router
		.use(dripModule(options))
		.use(Layout((props) => (
			<html lang="en" data-theme={themeSelection()?.variant}>
				<head>
					<BMDripBase />
				</head>
				<body>{props.children}</body>
			</html>
		)));
	router.route("/").get(Page(() => <main>hi</main>));
	return router;
}

async function get(router: Router, path: string, cookie?: string): Promise<Response> {
	const headers = cookie ? { cookie } : undefined;
	// deno-lint-ignore no-explicit-any
	return await router.handle(new Request(`http://localhost${path}`, { headers }), {} as any);
}

function rendered(html: string) {
	return {
		theme: html.match(/<style id="bm-drip-theme" data-drip-theme="([^"]+)"/)?.[1],
		variant: html.match(/<html[^>]*data-theme="([^"]+)"/)?.[1],
		fonts: html.includes('<style id="bm-drip-fonts"'),
	};
}

Deno.test("a request with no choice renders the first allowed theme", async () => {
	const html = await (await get(app(), "/")).text();
	assertEquals(rendered(html), { theme: "bearmetal", variant: undefined, fonts: true });
});

Deno.test("the cookies choose the theme and variant the page renders with", async () => {
	const res = await get(app(), "/", "bm-drip-theme=pride; bm-drip-variant=trans");
	assertEquals(rendered(await res.text()), { theme: "pride", variant: "trans", fonts: true });
});

Deno.test("a theme outside the allowlist falls back to the default", async () => {
	const res = await get(app(), "/", "bm-drip-theme=foxfire");
	assertEquals(rendered(await res.text()).theme, "bearmetal");
});

Deno.test("a variant the chosen theme does not have is dropped", async () => {
	const res = await get(app(), "/", "bm-drip-theme=bearmetal; bm-drip-variant=trans");
	assertEquals(rendered(await res.text()), { theme: "bearmetal", variant: undefined, fonts: true });
});

Deno.test("resolve() wins over the cookies, and is held to the allowlist", async () => {
	const router = app({
		themes: ["bearmetal", "pride"],
		resolve: (ctx) => ctx.url.searchParams.has("profile") ? { theme: "pride" } : undefined,
	});
	assertEquals(
		rendered(await (await get(router, "/?profile", "bm-drip-theme=bearmetal")).text()).theme,
		"pride",
	);
	assertEquals(
		rendered(await (await get(router, "/", "bm-drip-theme=pride")).text()).theme,
		"pride",
	);
});

Deno.test("the catalog lists every allowed theme with its variants", async () => {
	const catalog = await (await get(app(), "/@bearmetal/drip/themes")).json() as ThemeCatalog;
	assertEquals(catalog.default, "bearmetal");
	assertEquals(catalog.themes.map((t) => t.name), ["bearmetal", "pride"]);
	const pride = catalog.themes[1].variants.map((v) => v.name);
	assert(pride.includes("trans") && pride.includes("dark"), pride.join());
	assertEquals(catalog.themes[0].variants.filter((v) => v.default).length, 1);
});

Deno.test("allowed themes are served as stylesheets; anything else is a 404", async () => {
	const router = app();
	const css = await get(router, "/@bearmetal/drip/themes/pride");
	assertEquals(css.status, 200);
	assertStringIncludes(await css.text(), '[data-theme="trans"]');

	const fonts = await get(router, "/@bearmetal/drip/fonts/pride");
	assertEquals(fonts.status, 200);
	assertStringIncludes(await fonts.text(), "/@bearmetal/font-files/");

	for (const path of ["themes/foxfire", "fonts/foxfire", "themes/..%2Fsecrets"]) {
		const res = await get(router, `/@bearmetal/drip/${path}`);
		await res.body?.cancel();
		assertEquals(res.status, 404, path);
	}
});
