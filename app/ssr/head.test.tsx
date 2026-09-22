import { assertEquals, assertMatch } from "@std/assert";
import type { RouterContext } from "@bearmetal/router";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { contributeHead, Page } from "./mod.ts";

async function render(head: () => JSX.Element | JSX.Element[]): Promise<string> {
	const handler = Page(() => (
		<html>
			<head>{head()}</head>
			<body></body>
		</html>
	));
	const ctx = { state: {}, request: new Request("http://localhost/") } as unknown as RouterContext<
		Record<string, never>
	>;
	const res = await handler(ctx, () => Promise.resolve(new Response()));
	return await res.text();
}

Deno.test("contributions go at the end of <head> by default", async () => {
	const remove = contributeHead(() => <script src="/end.js"></script>);
	try {
		const html = await render(() => <title>t</title>);
		assertMatch(html, /<title>t<\/title><script src="\/end.js"><\/script><\/head>/);
	} finally {
		remove();
	}
});

Deno.test("a start contribution goes ahead of the page's own tags, after <meta charset>", async () => {
	const removeStart = contributeHead(() => <script type="importmap">{"{}"}</script>, {
		at: "start",
	});
	const removeEnd = contributeHead(() => <script src="/end.js"></script>);
	try {
		const html = await render(() => [
			<meta charset="utf-8" />,
			<script type="module" src="/page.js"></script>,
		]);
		const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
		assertEquals(
			[...head.matchAll(/<(meta|script)[^>]*>/g)].map((m) => m[0]),
			[
				`<meta charset="utf-8">`,
				`<script type="importmap">`,
				`<script type="module" src="/page.js">`,
				`<script src="/end.js">`,
			],
		);
	} finally {
		removeStart();
		removeEnd();
	}
});

Deno.test("a start contribution leads <head> when there is no <meta charset>", async () => {
	const remove = contributeHead(() => <script type="importmap">{"{}"}</script>, { at: "start" });
	try {
		const html = await render(() => <title>t</title>);
		assertMatch(html, /<head><script type="importmap">\{\}<\/script><title>/);
	} finally {
		remove();
	}
});
