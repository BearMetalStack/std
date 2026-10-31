import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Router } from "@bearmetal/router";

const INFO = {} as Deno.ServeHandlerInfo;
import { Layout, Page } from "@bearmetal/app/ssr";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { gutenbeargModule } from "./module.tsx";

const dir = new URL("./examples/bramble/.bearmetal/gutenbearg", import.meta.url).pathname;

function HostLayout({ children, title }: { children: JSX.Element; title: string }): JSX.Element {
	return (
		<html>
			<head>
				<title>{title} · Host</title>
			</head>
			<body>
				<header id="host-header">Host</header>
				{children}
			</body>
		</html>
	);
}

async function host(frame: "shell" | "article") {
	const docs = await gutenbeargModule({ dir, base: "/docs", frame, report: false });
	const router = new Router();
	router.use(Layout(HostLayout));
	router.route("/").get(Page(() => <p>home</p>, "Home"));
	router.use(docs);
	const get = async (path: string) => {
		const res = await router.handle(new Request(`http://x${path}`), INFO);
		return { status: res.status, html: await res.text() };
	};
	return { docs, get };
}

Deno.test("module: embedded pages render inside the app's layout", async () => {
	const { docs, get } = await host("shell");
	using _ = docs;
	const page = await get("/docs/core/learn/reactivity");
	assertEquals(page.status, 200);
	assertStringIncludes(page.html, '<header id="host-header">');
	assertStringIncludes(page.html, "<title>Reactivity · Host</title>");
	const head = page.html.slice(0, page.html.indexOf("</head>"));
	assertStringIncludes(head, 'href="/@bearmetal/gutenbearg/gutenbearg.css"');
	assertStringIncludes(page.html, "gb-docsbar");
	assert(!page.html.includes("gb-header"));

	const home = await get("/");
	assert(!home.html.includes("gutenbearg.css"));

	const missing = await get("/docs/nowhere/at-all");
	assertEquals(missing.status, 404);
	assertStringIncludes(missing.html, '<header id="host-header">');
	assertStringIncludes(missing.html, "This page wandered off");
});

Deno.test("module: render() hands the app a view with its own stylesheet", async () => {
	const docs = await gutenbeargModule({ dir, base: "/help", routes: false, report: false });
	using _ = docs;
	const { status, title, view } = docs.render("core/learn/reactivity");
	assertEquals(status, 200);
	assertEquals(title, "Reactivity");
	const { renderToString } = await import("@bearmetal/app/ssr");
	const html = await renderToString(view);
	assertStringIncludes(html, "frame-article");
	assertStringIncludes(html, 'rel="stylesheet"');
	assertStringIncludes(html, 'href="/help/core/');
});

Deno.test("module: without a Layout, embedded frames fall back to documents", async () => {
	const docs = await gutenbeargModule({ dir, base: "/docs", frame: "shell", report: false });
	using _ = docs;
	const router = new Router().use(docs);
	const res = await router.handle(new Request("http://x/docs/core/learn/reactivity"), INFO);
	assertStringIncludes(await res.text(), "<html");
});
