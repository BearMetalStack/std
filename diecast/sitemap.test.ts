import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderSitemap, sitemapEntries } from "./sitemap.ts";
import type { GeneratedPage } from "./types.ts";

const page = (file: string, overrides: Partial<GeneratedPage> = {}): GeneratedPage => ({
	url: `/${file}`,
	file,
	status: 200,
	contentType: "text/html; charset=utf-8",
	bytes: 0,
	...overrides,
});

const locs = async (...args: Parameters<typeof sitemapEntries>) =>
	(await sitemapEntries(...args)).map((e) => e.loc);

Deno.test("lists pages at the path their file is served from", async () => {
	const urls = await locs(
		[page("index.html"), page("about/index.html"), page("contact.html")],
		{ origin: "https://example.com" },
	);
	assertEquals(urls, [
		"https://example.com/",
		"https://example.com/about/",
		"https://example.com/contact.html",
	]);
});

Deno.test("leaves out assets and redirect shims", async () => {
	const urls = await locs([
		page("index.html"),
		page("app.js", { contentType: "text/javascript" }),
		page("old/index.html", { status: 301 }),
	], { origin: "https://example.com" });
	assertEquals(urls, ["https://example.com/"]);
});

Deno.test("resolves against an origin with a base path", async () => {
	const urls = await locs([page("index.html"), page("about/index.html")], {
		origin: "https://example.com/docs",
	});
	assertEquals(urls, ["https://example.com/docs/", "https://example.com/docs/about/"]);
});

Deno.test("exclude drops pages by served path", async () => {
	const urls = await locs([page("index.html"), page("404/index.html")], {
		origin: "https://example.com",
		exclude: (path) => path === "/404/",
	});
	assertEquals(urls, ["https://example.com/"]);
});

Deno.test("renders a urlset and escapes locations", async () => {
	const xml = await renderSitemap([page("a&b/index.html")], { origin: "https://example.com" });
	assertStringIncludes(xml, '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
	assertStringIncludes(xml, "<loc>https://example.com/a&amp;b/</loc>");
});

const origin = "https://example.com";

Deno.test("dates nothing unless told to", async () => {
	const entries = await sitemapEntries([page("index.html")], { origin });
	assertEquals(entries, [{ loc: "https://example.com/" }]);
	const xml = await renderSitemap([page("index.html")], { origin });
	assertEquals(xml.includes("<lastmod>"), false);
});

Deno.test("uses the manifest's lastmod, formatting a Date", async () => {
	const entries = await sitemapEntries([
		page("a/index.html", { lastmod: new Date("2026-01-02T03:04:05Z") }),
		page("b/index.html", { lastmod: "2026-03-01" }),
	], { origin });
	assertEquals(entries, [
		{ loc: "https://example.com/a/", lastmod: "2026-01-02T03:04:05.000Z" },
		{ loc: "https://example.com/b/", lastmod: "2026-03-01" },
	]);
});

Deno.test("the callback dates pages the manifest did not, and overrides it", async () => {
	const seen: string[] = [];
	const entries = await sitemapEntries([
		page("index.html"),
		page("a/index.html", { lastmod: "2026-01-01" }),
		page("b/index.html", { lastmod: "2026-01-01" }),
	], {
		origin,
		lastmod: (path, p) => {
			seen.push(path);
			if (path === "/") return Promise.resolve("2026-05-05");
			if (path === "/a/") return new Date(`${p.lastmod}T12:00:00Z`);
			return undefined;
		},
	});
	assertEquals(seen, ["/", "/a/", "/b/"]);
	assertEquals(entries, [
		{ loc: "https://example.com/", lastmod: "2026-05-05" },
		{ loc: "https://example.com/a/", lastmod: "2026-01-01T12:00:00.000Z" },
		{ loc: "https://example.com/b/", lastmod: "2026-01-01" },
	]);
});

Deno.test("drops an invalid Date rather than writing a bad value", async () => {
	const entries = await sitemapEntries([page("index.html", { lastmod: new Date("nope") })], {
		origin,
	});
	assertEquals(entries, [{ loc: "https://example.com/" }]);
});

Deno.test("renders lastmod inside its url", async () => {
	const xml = await renderSitemap([page("index.html", { lastmod: "2026-03-01" })], { origin });
	assertStringIncludes(
		xml,
		"<url>\n\t\t<loc>https://example.com/</loc>\n\t\t<lastmod>2026-03-01</lastmod>\n\t</url>",
	);
});
