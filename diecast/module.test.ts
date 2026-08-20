import { assertEquals } from "@std/assert";
import Router, { Html, Module } from "@bearmetal/router";
import { joinPath } from "@bearmetal/miscellanea";
import { diecastModule } from "./module.ts";

/** The module writes without awaiting, so give the write a turn to land. */
async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 20));
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
	const dir = await Deno.makeTempDir();
	try {
		await fn(dir);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await Deno.stat(path);
		return true;
	} catch {
		return false;
	}
}

const get = (router: Router, path: string) =>
	router.handle(new Request(`http://localhost${path}`), {} as never);

Deno.test("snapshots a served page without disturbing the response", async () => {
	await withTempDir(async (outDir) => {
		const pages = new Module();
		pages.route("/about").get(() => Html("<h1>about</h1>"));

		const router = new Router();
		router.use(diecastModule({ outDir }));
		router.use(pages);

		const res = await get(router, "/about");
		// The caller still gets the whole body.
		assertEquals(await res.text(), "<h1>about</h1>");

		await settle();
		assertEquals(
			await Deno.readTextFile(joinPath(outDir, "about/index.html")),
			"<h1>about</h1>",
		);
	});
});

Deno.test("honours the flat output style", async () => {
	await withTempDir(async (outDir) => {
		const pages = new Module();
		pages.route("/about").get(() => Html("<h1>about</h1>"));

		const router = new Router();
		router.use(diecastModule({ outDir, outputStyle: "flat" }));
		router.use(pages);

		await get(router, "/about");
		await settle();

		assertEquals(await Deno.readTextFile(joinPath(outDir, "about.html")), "<h1>about</h1>");
	});
});

Deno.test("leaves non-HTML and non-200 responses alone", async () => {
	await withTempDir(async (outDir) => {
		const pages = new Module();
		pages.route("/data.json").get(() =>
			new Response(`{"a":1}`, { headers: { "Content-Type": "application/json" } })
		);
		pages.route("/missing").get(() => new Response("gone", { status: 404 }));

		const router = new Router();
		router.use(diecastModule({ outDir }));
		router.use(pages);

		await get(router, "/data.json");
		await get(router, "/missing");
		await settle();

		assertEquals(await exists(joinPath(outDir, "data.json")), false);
		assertEquals(await exists(joinPath(outDir, "missing")), false);
	});
});

Deno.test("allContentTypes snapshots successful assets too", async () => {
	await withTempDir(async (outDir) => {
		const pages = new Module();
		pages.route("/site.css").get(() =>
			new Response("body{}", { headers: { "Content-Type": "text/css" } })
		);

		const router = new Router();
		router.use(diecastModule({ outDir, allContentTypes: true }));
		router.use(pages);

		await get(router, "/site.css");
		await settle();

		assertEquals(await Deno.readTextFile(joinPath(outDir, "site.css")), "body{}");
	});
});

Deno.test("ignore keeps matching paths out of the snapshot", async () => {
	await withTempDir(async (outDir) => {
		const pages = new Module();
		pages.route("/admin/panel").get(() => Html("<h1>secret</h1>"));
		pages.route("/about").get(() => Html("<h1>about</h1>"));

		const router = new Router();
		router.use(diecastModule({ outDir, ignore: ["/admin/*"] }));
		router.use(pages);

		await get(router, "/admin/panel");
		await get(router, "/about");
		await settle();

		assertEquals(await exists(joinPath(outDir, "admin/panel")), false);
		assertEquals(await exists(joinPath(outDir, "about/index.html")), true);
	});
});

Deno.test("snapshots a parameterised page at the URL it was served from", async () => {
	await withTempDir(async (outDir) => {
		const pages = new Module();
		pages.route("/md/:file").get((ctx) => Html(`<h1>${ctx.params.file}</h1>`));

		const router = new Router();
		router.use(diecastModule({ outDir }));
		router.use(pages);

		await get(router, "/md/intro");
		await settle();

		assertEquals(
			await Deno.readTextFile(joinPath(outDir, "md/intro/index.html")),
			"<h1>intro</h1>",
		);
	});
});
