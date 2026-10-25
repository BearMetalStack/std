import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { renderToString } from "@bearmetal/app/ssr";
import type { PageContext, ShellLayout, SiteContent } from "../types.ts";
import { content } from "../examples/bramble/content/mod.ts";
import { renderRoute } from "./mod.ts";

const ctx = (route: string, layout: ShellLayout = "trail", version = "0.9"): PageContext => ({
	site: content.site,
	route,
	layout,
	version,
	base: "",
});

const render = async (site: SiteContent, c: PageContext) => {
	const { status, view } = renderRoute(site, c);
	return { status, html: await renderToString(view) };
};

Deno.test("each kind of route renders with the right status", async () => {
	assertEquals((await render(content, ctx(""))).status, 200);
	assertEquals((await render(content, ctx("learn/reactivity"))).status, 200);
	assertEquals((await render(content, ctx("changelog"))).status, 200);
	const draft = await render(content, ctx("learn/routing"));
	assertEquals(draft.status, 404);
	assertStringIncludes(draft.html, "still hibernating");
	const missing = await render(content, ctx("nowhere/at-all"));
	assertEquals(missing.status, 404);
	assertStringIncludes(missing.html, "This page wandered off");
});

Deno.test("the outline is measured from the body", async () => {
	const { html } = await render(content, ctx("learn/reactivity", "shelves"));
	for (const id of ["the-mental-model", "derived-values", "common-pitfalls"]) {
		assertStringIncludes(html, `data-gb-heading="${id}"`);
	}
	assertStringIncludes(html, "Terms on this page");
});

Deno.test("every layout renders every written page", async () => {
	for (const layout of ["trail", "shelves", "den"] as const) {
		for (const route of Object.keys(content.pages)) {
			const { html } = await render(content, ctx(route, layout));
			assertStringIncludes(html, `layout-${layout}`);
		}
	}
});

Deno.test("an older version warns when the page didn't exist yet", async () => {
	const old = await render(content, ctx("reference/signal", "trail", "0.8"));
	assertStringIncludes(old.html, "You’re reading the <b>v0.8</b>");
	const site = { ...content, site: { ...content.site, versions: ["0.9", "0.5"] } };
	const { html } = await render(site, {
		...ctx("reference/signal", "trail", "0.5"),
		site: site.site,
	});
	assertStringIncludes(html, "doesn’t exist in v0.5");
});

Deno.test("diagram edges with labels split into nodes", async () => {
	const { html } = await render(content, ctx("learn/reactivity"));
	assertStringIncludes(html, "<em>write</em>");
	assert(!html.includes("-[write]"));
});
