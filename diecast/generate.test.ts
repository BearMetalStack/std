import { assertEquals, assertStringIncludes } from "@std/assert";
import Router, { Html, Script } from "@bearmetal/router";
import { joinPath } from "@bearmetal/miscellanea";
import { diecast } from "./generate.ts";
import { defineManifest } from "./manifest.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
	const dir = await Deno.makeTempDir();
	try {
		await fn(dir);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
}

const read = (dir: string, file: string) => Deno.readTextFile(joinPath(dir, file));

async function exists(path: string): Promise<boolean> {
	try {
		await Deno.stat(path);
		return true;
	} catch {
		return false;
	}
}

Deno.test("generates every static route", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/").get(() => Html("<h1>home</h1>"));
		router.route("/about").get(() => Html("<h1>about</h1>"));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, true);
		assertEquals(report.failures, []);
		assertEquals(await read(outDir, "index.html"), "<h1>home</h1>");
		assertEquals(await read(outDir, "about/index.html"), "<h1>about</h1>");
	});
});

Deno.test("flat output style writes sibling files", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/about").get(() => Html("<h1>about</h1>"));

		await diecast(router, { outDir, outputStyle: "flat", discover: { links: false } });

		assertEquals(await read(outDir, "about.html"), "<h1>about</h1>");
	});
});

Deno.test("generates a page per manifest permutation", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/md/:file").get((ctx) => Html(`<h1>${ctx.params.file}</h1>`));

		const manifest = defineManifest({
			"/md/:file": {
				permutations: () => ["intro", "advanced"].map((file) => ({ params: { file } })),
			},
		});

		const report = await diecast(router, { outDir, manifest, discover: { links: false } });

		assertEquals(report.ok, true);
		assertEquals(await read(outDir, "md/intro/index.html"), "<h1>intro</h1>");
		assertEquals(await read(outDir, "md/advanced/index.html"), "<h1>advanced</h1>");
	});
});

Deno.test("query permutations render with their query and honour out", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/search").get((ctx) => Html(`<p>${ctx.url.searchParams.get("q")}</p>`));

		const manifest = defineManifest({
			"/search": {
				permutations: [
					{ params: {}, query: { q: "bears" }, out: "search/bears/index.html" },
				],
			},
		});

		await diecast(router, { outDir, manifest, discover: { links: false } });

		assertEquals(await read(outDir, "search/bears/index.html"), "<p>bears</p>");
	});
});

Deno.test("reports an uncovered parameterised route without rendering it", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/about").get(() => Html("<h1>about</h1>"));
		router.route("/md/:file").get(() => Html("<h1>md</h1>"));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, false);
		assertEquals(report.problems.length, 1);
		assertEquals(report.problems[0].kind, "uncovered-route");
		// The rest of the site is still built.
		assertEquals(await read(outDir, "about/index.html"), "<h1>about</h1>");
	});
});

Deno.test("skip opts a route out without reporting it", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/md/:file").get(() => Html("<h1>md</h1>"));

		const report = await diecast(router, {
			outDir,
			manifest: { "/md/:file": { permutations: [], skip: true } },
			discover: { links: false },
		});

		assertEquals(report.ok, true);
	});
});

Deno.test("surfaces the real error behind a handler crash", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/good").get(() => Html("<h1>good</h1>"));
		router.route("/bad").get(() => {
			throw new Error("template exploded");
		});

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, false);
		assertEquals(report.failures.length, 1);
		assertEquals(report.failures[0].url, "/bad");
		assertEquals(report.failures[0].status, 500);
		// Without onError this would only ever have been an opaque 500.
		assertStringIncludes(report.failures[0].message, "template exploded");

		// Report and continue: the good page is still written.
		assertEquals(await read(outDir, "good/index.html"), "<h1>good</h1>");
	});
});

Deno.test("strict aborts instead of finishing the build", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/bad").get(() => {
			throw new Error("nope");
		});

		const report = await diecast(router, {
			outDir,
			strict: true,
			discover: { links: false },
		});

		assertEquals(report.ok, false);
		assertEquals(report.failures.length, 1);
	});
});

Deno.test("follows same-origin links to pages not otherwise queued", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/").get(() =>
			Html(`<a href="/md/intro">intro</a><a href="https://example.com">off</a>`)
		);
		router.route("/md/:file").get((ctx) => Html(`<h1>${ctx.params.file}</h1>`));

		const report = await diecast(router, {
			outDir,
			// The param route is deliberately declared skipped, so the only way
			// this page can appear is by following the link.
			manifest: { "/md/:file": { permutations: [], skip: true } },
			discover: { links: true },
		});

		assertEquals(report.ok, true);
		assertEquals(await read(outDir, "md/intro/index.html"), "<h1>intro</h1>");
	});
});

Deno.test("fetches assets referenced by attributes and by inline module imports", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/").get(() =>
			Html(`<!DOCTYPE html><html><head>
				<link rel="stylesheet" href="/site.css">
				<script type="module">import "./chunk-A1B2.js";</script>
			</head><body>hi</body></html>`)
		);
		router.route("/site.css").get(() =>
			new Response("body{}", {
				headers: { "Content-Type": "text/css" },
			})
		);
		router.route("/chunk-A1B2.js").get(() => Script("export const x = 1;"));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, true);
		assertEquals(await read(outDir, "site.css"), "body{}");
		// The chunk is only reachable through the inline script body.
		assertEquals(await read(outDir, "chunk-A1B2.js"), "export const x = 1;");
	});
});

Deno.test("writes a nested chunk where the browser asks for it, fetching it from the root", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/md/:file").get(() =>
			Html(`<script type="module">import "./chunk-Z9.js";</script>`)
		);
		// Served only at the root, the way stack's single-segment /:script route does.
		router.route("/chunk-Z9.js").get(() => Script("export const z = 9;"));

		const report = await diecast(router, {
			outDir,
			manifest: { "/md/:file": { permutations: [{ params: { file: "intro" } }] } },
			discover: { links: false },
		});

		assertEquals(report.ok, true);
		// The page lives at /md/intro/, so the browser requests /md/intro/chunk-Z9.js.
		assertEquals(await read(outDir, "md/intro/chunk-Z9.js"), "export const z = 9;");
	});
});

Deno.test("does not write a page where an asset was expected", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		// The page is written to md/intro/index.html, so `../chunk-Z9.js` resolves
		// to /md/chunk-Z9.js - which this catch-all page route answers 200 HTML
		// for, treating the filename as a slug. Writing that would leave an HTML
		// body at a .js path, and the page using it would break silently.
		router.route("/md/:file").get(() =>
			Html(`<script type="module">import "../chunk-Z9.js";</script>`)
		);

		const report = await diecast(router, {
			outDir,
			manifest: { "/md/:file": { permutations: [{ params: { file: "intro" } }] } },
			discover: { links: false },
		});

		assertEquals(await exists(joinPath(outDir, "md/chunk-Z9.js")), false);
		assertEquals(await exists(joinPath(outDir, "md/chunk-Z9.js/index.html")), false);

		assertEquals(report.ok, false);
		assertEquals(report.failures.length, 1);
		assertStringIncludes(report.failures[0].message, "returned HTML");
	});
});

Deno.test("prefers the root fallback over a colliding page route", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/md/:file").get(() =>
			Html(`<script type="module">import "../chunk-Z9.js";</script>`)
		);
		// The real chunk, served at the root the way stack does it.
		router.route("/chunk-Z9.js").get(() => Script("export const z = 9;"));

		const report = await diecast(router, {
			outDir,
			manifest: { "/md/:file": { permutations: [{ params: { file: "intro" } }] } },
			discover: { links: false },
		});

		assertEquals(report.ok, true);
		assertEquals(await read(outDir, "md/chunk-Z9.js"), "export const z = 9;");
	});
});

Deno.test("turns a redirect into a shim a static host can serve", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/old").get(() =>
			new Response(null, { status: 301, headers: { Location: "/new" } })
		);
		router.route("/new").get(() => Html("<h1>new</h1>"));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, true);
		const shim = await read(outDir, "old/index.html");
		assertStringIncludes(shim, `url=/new`);
		assertEquals(await read(outDir, "new/index.html"), "<h1>new</h1>");
	});
});

Deno.test("copies directories mounted with serveDirectory", async () => {
	await withTempDir(async (outDir) => {
		const assets = await Deno.makeTempDir();
		try {
			await Deno.writeTextFile(joinPath(assets, "logo.svg"), "<svg/>");
			await Deno.mkdir(joinPath(assets, "fonts"));
			await Deno.writeTextFile(joinPath(assets, "fonts/body.woff2"), "font");

			const router = new Router();
			router.route("/").get(() => Html("<h1>home</h1>"));
			router.serveDirectory(assets, "/assets");

			const report = await diecast(router, { outDir, discover: { links: false } });

			assertEquals(report.copiedDirs, ["/assets"]);
			assertEquals(await read(outDir, "assets/logo.svg"), "<svg/>");
			assertEquals(await read(outDir, "assets/fonts/body.woff2"), "font");
		} finally {
			await Deno.remove(assets, { recursive: true });
		}
	});
});

Deno.test("skips non-GET routes and the reserved namespace", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/").get(() => Html("<h1>home</h1>"));
		router.route("/submit").post(() => new Response("ok"));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, true);
		assertEquals(report.pages.map((p) => p.url), ["/"]);
		assertEquals(await exists(joinPath(outDir, "submit")), false);
	});
});

Deno.test("follows an import inside an already-fetched chunk", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/").get(() => Html(`<script type="module">import "./chunk-A.js";</script>`));
		// The entry chunk pulls in a further chunk by its own relative import -
		// not visible anywhere in the page's HTML.
		router.route("/chunk-A.js").get(() => Script(`import "./chunk-B.js"; export const a = 1;`));
		router.route("/chunk-B.js").get(() => Script("export const b = 2;"));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, true);
		assertEquals(
			await read(outDir, "chunk-B.js"),
			"export const b = 2;",
		);
	});
});

Deno.test("rewrites a page's reference once an extensionless asset gains one on disk", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/").get(() =>
			Html(`<script type="module" src="/@bearmetal/components/index"></script>`)
		);
		// A route param, not a filename - the live server answers with no
		// extension in the URL at all.
		router.route("/@bearmetal/components/:bundle").get(() => Script("export const c = 1;"));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, true);
		assertEquals(
			await read(outDir, "@bearmetal/components/index.js"),
			"export const c = 1;",
		);
		// The file only exists at the .js path - the reference has to match it.
		const html = await read(outDir, "index.html");
		assertStringIncludes(html, `src="/@bearmetal/components/index.js"`);
		assertEquals(html.includes(`src="/@bearmetal/components/index"`), false);
	});
});

Deno.test("reports what it wrote", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/about").get(() => Html("<h1>about</h1>"));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.pages.length, 1);
		assertEquals(report.pages[0].file, "about/index.html");
		assertEquals(report.pages[0].status, 200);
		assertStringIncludes(report.pages[0].contentType ?? "", "text/html");
		assertEquals(report.pages[0].bytes, "<h1>about</h1>".length);
		assertEquals(report.duration >= 0, true);
	});
});

/** A generator programmed by its query, the way an SVG badge service is. */
function badgeRouter(): Router {
	const router = new Router();
	router.route("/badge").get((ctx) =>
		new Response(
			`<svg><text>${ctx.url.searchParams.get("label")}</text></svg>`,
			{ headers: { "Content-Type": "image/svg+xml" } },
		)
	);
	return router;
}

Deno.test("writes one asset per query and points the page at each", async () => {
	await withTempDir(async (outDir) => {
		const router = badgeRouter();
		router.route("/").get(() =>
			Html(
				`<img src="/badge?label=one&amp;color=red">` +
					`<img src="/badge?label=two&amp;color=red">`,
			)
		);

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, true);
		// Two badges, two files - not one file written twice. The route itself
		// is static, so it also generates once with no query at all.
		const svgs = report.pages.filter((p) => p.contentType?.startsWith("image/svg"));
		assertEquals(svgs.length, 3);
		assertEquals(new Set(svgs.map((p) => p.file)).size, 3);

		const html = await read(outDir, "index.html");
		// Nothing is left pointing at a query a static host cannot answer.
		assertEquals(html.includes("/badge?"), false);
		assertEquals(html.includes("&amp;"), false);

		const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
		assertEquals(srcs.length, 2);
		const contents = await Promise.all(
			srcs.map((src) => read(outDir, src.replace(/^\//, ""))),
		);
		// Each reference reaches the badge that was rendered for its query.
		assertStringIncludes(contents[0], "<text>one</text>");
		assertStringIncludes(contents[1], "<text>two</text>");
	});
});

Deno.test("a query-carrying reference survives the ampersand escaping in markup", async () => {
	await withTempDir(async (outDir) => {
		const router = badgeRouter();
		router.route("/").get(() => Html(`<img src="/badge?label=hi&amp;color=red">`));

		await diecast(router, { outDir, discover: { links: false } });

		const html = await read(outDir, "index.html");
		const src = html.match(/src="([^"]+)"/)?.[1] ?? "";
		// `&amp;` decoded to `&`, so the label parameter is the label and not
		// swallowed by a parameter called `amp;color`.
		assertStringIncludes(await read(outDir, src.replace(/^\//, "")), "<text>hi</text>");
	});
});

Deno.test("rewrites a relative query reference from a nested page", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/md/badge").get((ctx) =>
			new Response(`<svg>${ctx.url.searchParams.get("label")}</svg>`, {
				headers: { "Content-Type": "image/svg+xml" },
			})
		);
		// The page is written to md/intro/index.html, so `../badge?...` is
		// requested as /md/badge?... - and the reference has to be rewritten
		// where it sits, relative and all.
		router.route("/md/intro").get(() => Html(`<img src="../badge?label=deep">`));

		const report = await diecast(router, { outDir, discover: { links: false } });

		assertEquals(report.ok, true);
		const html = await read(outDir, "md/intro/index.html");
		assertEquals(html.includes("badge?label=deep"), false);
		const src = html.match(/src="([^"]+)"/)?.[1] ?? "";
		assertStringIncludes(await read(outDir, src.replace(/^\//, "")), "<svg>deep</svg>");
	});
});

Deno.test("a followed link with a query becomes its own page", async () => {
	await withTempDir(async (outDir) => {
		const router = new Router();
		router.route("/").get(() =>
			Html(`<a href="/search?q=bears">bears</a><a href="/search?q=bees">bees</a>`)
		);
		router.route("/search").get((ctx) =>
			Html(`<h1>${ctx.url.searchParams.get("q") ?? "all"}</h1>`)
		);

		const report = await diecast(router, { outDir });

		assertEquals(report.ok, true);
		// The unparameterised route still generates at its own path.
		assertEquals(await read(outDir, "search/index.html"), "<h1>all</h1>");

		const hrefs = [...(await read(outDir, "index.html")).matchAll(/href="([^"]+)"/g)]
			.map((m) => m[1]);
		assertEquals(hrefs.some((h) => h.includes("?")), false);
		assertEquals(new Set(hrefs).size, 2);

		const pages = await Promise.all(
			hrefs.map((h) => read(outDir, joinPath(h.replace(/^\//, ""), "index.html"))),
		);
		assertStringIncludes(pages[0], "<h1>bears</h1>");
		assertStringIncludes(pages[1], "<h1>bees</h1>");
	});
});
