import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { renderToString } from "@bearmetal/app/ssr";
import type { FrameKind, PageContext, ShellLayout } from "../types.ts";
import { loadContent } from "../content/load.ts";
import { renderRoute } from "./mod.ts";

const content = await loadContent(
	new URL("../examples/bramble/.bearmetal/gutenbearg", import.meta.url).pathname,
);

const render = async (route: string, layout: ShellLayout = "trail") => {
	const ctx: PageContext = { content, route, layout, base: "" };
	const { status, view } = renderRoute(ctx);
	return { status, html: await renderToString(view) };
};

Deno.test("the example loads without problems", () => {
	assertEquals(content.diagnostics, []);
});

Deno.test("each kind of route renders with the right status", async () => {
	assertEquals((await render("")).status, 200);
	assertEquals((await render("core/learn/reactivity")).status, 200);
	assertEquals((await render("changelog")).status, 200);
	assertEquals((await render("core/changelog")).status, 200);
	const draft = await render("guides/start-here/deploying");
	assertEquals(draft.status, 200);
	assertStringIncludes(draft.html, "still hibernating");
	const missing = await render("nowhere/at-all");
	assertEquals(missing.status, 404);
	assertStringIncludes(missing.html, "This page wandered off");
});

Deno.test("every layout renders every route", async () => {
	for (const layout of ["trail", "shelves", "den"] as const) {
		for (const route of content.routes.keys()) {
			const { html } = await render(route, layout);
			assertStringIncludes(html, `layout-${layout}`);
		}
	}
});

Deno.test("the outline and terms are measured from the body", async () => {
	const { html } = await render("core/learn/reactivity", "shelves");
	for (const id of ["the-mental-model", "derived-values", "common-pitfalls"]) {
		assertStringIncludes(html, `data-gb-heading="${id}"`);
	}
	assertStringIncludes(html, "Terms on this page");
});

Deno.test("older versions get a banner and a version menu", async () => {
	const { html } = await render("core/v0.8/reference/signal");
	assertStringIncludes(html, "You’re reading the <b>v0.8</b>");
	assertStringIncludes(html, 'href="/core/reference/signal">Go to v0.9');
	const gone = await render("core/v0.8/reference/create-signal");
	assertStringIncludes(gone.html, "This page is gone in the latest release.");
	const latest = await render("core/reference/signal");
	assertStringIncludes(latest.html, 'href="/core/v0.8/reference/signal"');
});

const framed = async (route: string, frame: FrameKind) => {
	const { status, view } = renderRoute({ content, route, layout: "shelves", base: "/docs", frame });
	return { status, html: await renderToString(view) };
};

Deno.test("the shell frame keeps the docs chrome but not the document or header", async () => {
	const { html } = await framed("core/learn/reactivity", "shell");
	assert(!html.includes("<html"));
	assert(!html.includes("gb-header"));
	assert(!html.includes("data-gb-theme"));
	assert(!html.includes('rel="stylesheet"'));
	assertStringIncludes(html, 'class="gb-app gb-embedded frame-shell layout-shelves"');
	for (const part of ["gb-docsbar", "data-gb-search", "gb-side", "gb-aside", 'id="gb-data"']) {
		assertStringIncludes(html, part);
	}
	assertStringIncludes(html, 'href="/docs/core/v0.8/learn/reactivity"');
});

Deno.test("the article frame is the page alone", async () => {
	const { html } = await framed("core/learn/reactivity", "article");
	assert(!html.includes("gb-side"));
	assert(!html.includes("gb-docsbar"));
	assertStringIncludes(html, "gb-article");
	assertStringIncludes(html, 'id="gb-data"');
	const home = await framed("", "article");
	assert(!home.html.includes("gb-header"));
	assertEquals((await framed("nowhere", "article")).status, 404);
});
