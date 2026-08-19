import { assertEquals } from "@std/assert";
import {
	discoverFrom,
	discoverFromScript,
	extractReferences,
	inlineModuleImports,
	resolveReference,
	rootFallbackFor,
	scriptImports,
} from "./discover.ts";

const PAGE = new URL("http://localhost/about");

Deno.test("extractReferences finds subresources across quoting styles", () => {
	const html = `
		<link rel="stylesheet" href="/styles/site.css">
		<script src='/app.js'></script>
		<img src=/logo.png>
		<source src="/clip.webm">
	`;
	const refs = extractReferences(html);
	assertEquals(refs.assets, ["/styles/site.css", "/app.js", "/logo.png", "/clip.webm"]);
});

Deno.test("extractReferences separates anchors from subresources", () => {
	const html = `<a href="/contact">Contact</a><link href="/site.css">`;
	const refs = extractReferences(html);
	assertEquals(refs.links, ["/contact"]);
	assertEquals(refs.assets, ["/site.css"]);
});

Deno.test("inlineModuleImports finds chunk imports inside script bodies", () => {
	// The shape app/ssr actually emits: an inlined entry that pulls its shared
	// chunks in by relative specifier.
	const html = `
		<script type="module">
			import { BMElement } from "./chunk-A1B2C3.js";
			import "./chunk-D4E5F6.js";
			export { x } from "./chunk-G7H8.js";
			const lazy = await import("./chunk-LAZY.js");
		</script>
	`;
	assertEquals(inlineModuleImports(html), [
		"./chunk-A1B2C3.js",
		"./chunk-D4E5F6.js",
		"./chunk-G7H8.js",
		"./chunk-LAZY.js",
	]);
});

Deno.test("inlineModuleImports ignores non-module and external scripts", () => {
	const html = `
		<script>import("./not-a-module.js");</script>
		<script src="/external.js"></script>
	`;
	assertEquals(inlineModuleImports(html), []);
});

Deno.test("inlineModuleImports feeds into the asset list", () => {
	const html = `<script type="module">import "./chunk-X.js";</script>`;
	assertEquals(extractReferences(html).assets, ["./chunk-X.js"]);
});

Deno.test("resolveReference resolves relative specifiers against the page", () => {
	assertEquals(
		resolveReference("./chunk-X.js", new URL("http://localhost/md/intro/"))?.pathname,
		"/md/intro/chunk-X.js",
	);
	assertEquals(resolveReference("/site.css", PAGE)?.pathname, "/site.css");
	assertEquals(resolveReference("http://localhost/a.js", PAGE)?.pathname, "/a.js");
});

Deno.test("resolveReference drops what the browser will not fetch by path", () => {
	assertEquals(resolveReference("https://cdn.example.com/x.js", PAGE), null);
	assertEquals(resolveReference("data:text/css,body{}", PAGE), null);
	assertEquals(resolveReference("mailto:a@b.c", PAGE), null);
	assertEquals(resolveReference("#section", PAGE), null);
	assertEquals(resolveReference("   ", PAGE), null);
	// A bare specifier is an import-map entry, not a path.
	assertEquals(resolveReference("jsr:@bearmetal/app", PAGE), null);
});

Deno.test("resolveReference strips the fragment", () => {
	assertEquals(resolveReference("/docs#intro", PAGE)?.href, "http://localhost/docs");
});

Deno.test("discoverFrom de-duplicates and honours the toggles", () => {
	const html = `
		<link href="/site.css"><link href="/site.css">
		<a href="/contact">c</a>
		<script type="module">import "./chunk-X.js";</script>
	`;
	const all = discoverFrom(html, PAGE, { assets: true, links: true });
	assertEquals(all.assets.map((u) => u.pathname), ["/site.css", "/chunk-X.js"]);
	assertEquals(all.links.map((u) => u.pathname), ["/contact"]);

	const noLinks = discoverFrom(html, PAGE, { assets: true, links: false });
	assertEquals(noLinks.links, []);
	assertEquals(noLinks.assets.length, 2);

	const noAssets = discoverFrom(html, PAGE, { assets: false, links: true });
	assertEquals(noAssets.assets, []);
});

Deno.test("scriptImports finds a chunk's own static and dynamic imports", () => {
	// The shape @bearmetal/jsx's isomorphic boundary actually emits: a runtime
	// branch between a client and server module, buried inside an already-
	// bundled chunk rather than the page's inline script.
	const js = `
		import { x } from "./chunk-A.js";
		var M = typeof document<"u" ? await import("./mod-CLIENT.js") : await import("./mod-SERVER.js");
		export { x };
	`;
	assertEquals(scriptImports(js), ["./chunk-A.js", "./mod-CLIENT.js", "./mod-SERVER.js"]);
});

Deno.test("discoverFromScript resolves a chunk's imports against its own URL, not the page's", () => {
	const js = `import "./mod-CLIENT.js";`;
	const chunkUrl = new URL("http://localhost/chunk-A.js");
	assertEquals(
		discoverFromScript(js, chunkUrl).map((u) => u.pathname),
		["/mod-CLIENT.js"],
	);
});

Deno.test("rootFallbackFor only applies below the top level", () => {
	assertEquals(
		rootFallbackFor(new URL("http://localhost/md/intro/chunk-X.js"))?.pathname,
		"/chunk-X.js",
	);
	// Already at the root: nothing to fall back to.
	assertEquals(rootFallbackFor(new URL("http://localhost/chunk-X.js")), null);
});
