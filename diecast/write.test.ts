import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { joinPath } from "@bearmetal/miscellanea";
import {
	extensionFor,
	hrefFor,
	isHtml,
	normalizeContentType,
	outputPathFor,
	queryTag,
	redirectShim,
	writeResponse,
} from "./write.ts";

const HTML = "text/html; charset=utf-8";

Deno.test("normalizeContentType strips parameters and casing", () => {
	assertEquals(normalizeContentType("text/html; charset=utf-8"), "text/html");
	assertEquals(normalizeContentType("TEXT/HTML"), "text/html");
	assertEquals(normalizeContentType(null), "");
});

Deno.test("isHtml only matches html", () => {
	assertEquals(isHtml(HTML), true);
	assertEquals(isHtml("text/css"), false);
	assertEquals(isHtml(null), false);
});

Deno.test("extensionFor inverts the router's content type table", () => {
	assertEquals(extensionFor(HTML), "html");
	assertEquals(extensionFor("text/javascript"), "js");
	assertEquals(extensionFor("image/svg+xml"), "svg");
	assertEquals(extensionFor("application/octet-stream"), undefined);
});

Deno.test("outputPathFor index style nests pages under a directory", () => {
	assertEquals(outputPathFor("/", HTML, "index"), "index.html");
	assertEquals(outputPathFor("/about", HTML, "index"), "about/index.html");
	assertEquals(
		outputPathFor("/md/getting-started", HTML, "index"),
		"md/getting-started/index.html",
	);
	// A trailing slash is the same page.
	assertEquals(outputPathFor("/about/", HTML, "index"), "about/index.html");
});

Deno.test("outputPathFor flat style writes sibling html files", () => {
	assertEquals(outputPathFor("/", HTML, "flat"), "index.html");
	assertEquals(outputPathFor("/about", HTML, "flat"), "about.html");
	assertEquals(outputPathFor("/md/getting-started", HTML, "flat"), "md/getting-started.html");
});

Deno.test("outputPathFor defaults to index style", () => {
	assertEquals(outputPathFor("/about", HTML), "about/index.html");
});

Deno.test("outputPathFor leaves a URL that already names an html file alone", () => {
	assertEquals(outputPathFor("/legacy/page.html", HTML, "index"), "legacy/page.html");
	assertEquals(outputPathFor("/legacy/page.htm", HTML, "flat"), "legacy/page.htm");
});

Deno.test("outputPathFor keeps asset paths verbatim", () => {
	assertEquals(outputPathFor("/chunk-A1B2.js", "text/javascript", "index"), "chunk-A1B2.js");
	assertEquals(outputPathFor("/styles/site.css", "text/css", "index"), "styles/site.css");
	// An extensionless asset still needs one to be servable.
	assertEquals(outputPathFor("/bundle", "text/javascript", "index"), "bundle.js");
});

Deno.test("outputPathFor decodes percent-encoded segments", () => {
	assertEquals(outputPathFor("/md/Chapter%201", HTML, "index"), "md/Chapter 1/index.html");
});

Deno.test("writeResponse writes the derived path and reports it", async () => {
	const outDir = await Deno.makeTempDir();
	try {
		const res = new Response("<h1>hi</h1>", { headers: { "Content-Type": HTML } });
		const written = await writeResponse(res, new URL("http://localhost/about"), { outDir });

		assertEquals(written.file, "about/index.html");
		assertEquals(await Deno.readTextFile(joinPath(outDir, "about/index.html")), "<h1>hi</h1>");
		assertEquals(written.bytes, 11);
	} finally {
		await Deno.remove(outDir, { recursive: true });
	}
});

Deno.test("writeResponse honours an explicit out path", async () => {
	const outDir = await Deno.makeTempDir();
	try {
		const res = new Response("results", { headers: { "Content-Type": HTML } });
		const written = await writeResponse(
			res,
			new URL("http://localhost/search?q=bears"),
			{ outDir, out: "search/bears/index.html" },
		);

		assertEquals(written.file, "search/bears/index.html");
		assertEquals(await Deno.readTextFile(joinPath(outDir, "search/bears/index.html")), "results");
	} finally {
		await Deno.remove(outDir, { recursive: true });
	}
});

Deno.test("writeResponse writes binary bodies unchanged", async () => {
	const outDir = await Deno.makeTempDir();
	try {
		const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
		const res = new Response(bytes, { headers: { "Content-Type": "image/png" } });
		await writeResponse(res, new URL("http://localhost/logo.png"), { outDir });

		assertEquals(await Deno.readFile(joinPath(outDir, "logo.png")), bytes);
	} finally {
		await Deno.remove(outDir, { recursive: true });
	}
});

Deno.test("writeResponse refuses to escape the output directory", async () => {
	const outDir = await Deno.makeTempDir();
	try {
		const res = new Response("nope", { headers: { "Content-Type": HTML } });
		await assertRejects(
			() =>
				writeResponse(res, new URL("http://localhost/x"), {
					outDir,
					out: "../../escaped.html",
				}),
			Error,
			"outside outDir",
		);
	} finally {
		await Deno.remove(outDir, { recursive: true });
	}
});

Deno.test("redirectShim points at the target and escapes it", () => {
	const shim = redirectShim("/new//home");
	assertStringIncludes(shim, `content="0; url=/new//home"`);
	assertStringIncludes(shim, `<link rel="canonical" href="/new//home">`);

	const escaped = redirectShim(`/a?x=1&y="2"`);
	assertStringIncludes(escaped, "&amp;");
	assertStringIncludes(escaped, "&quot;");
});

Deno.test("outputPathFor names a query-carrying asset for its query", () => {
	const one = outputPathFor("/badge?label=one", "image/svg+xml", "index");
	const two = outputPathFor("/badge?label=two", "image/svg+xml", "index");

	// The query is what the generator was programmed with, so it is part of
	// the identity of the file - two queries cannot share one name.
	assertEquals(one !== two, true);
	assertEquals(one, `badge.${queryTag("label=one")}.svg`);
	// The extension still comes from the content type, and stays last.
	assertEquals(one.endsWith(".svg"), true);
	// A path that already names a file keeps its own extension.
	assertEquals(
		outputPathFor("/badge.svg?label=one", "image/svg+xml", "index"),
		`badge.${queryTag("label=one")}.svg`,
	);
});

Deno.test("outputPathFor derives the same name on every build", () => {
	assertEquals(
		outputPathFor("/badge?a=1&b=2", "image/svg+xml"),
		outputPathFor("/badge?a=1&b=2", "image/svg+xml"),
	);
	// Order is not normalised away - a generator may well care about it.
	assertEquals(
		outputPathFor("/badge?a=1&b=2", "image/svg+xml") !==
			outputPathFor("/badge?b=2&a=1", "image/svg+xml"),
		true,
	);
});

Deno.test("outputPathFor keeps a query page clean-URL shaped", () => {
	const tag = queryTag("q=bears");
	assertEquals(outputPathFor("/search?q=bears", HTML, "index"), `search.${tag}/index.html`);
	assertEquals(outputPathFor("/search?q=bears", HTML, "flat"), `search.${tag}.html`);
	assertEquals(outputPathFor("/?q=bears", HTML, "index"), `index.${tag}/index.html`);
	// No query, no tag.
	assertEquals(outputPathFor("/search", HTML, "index"), "search/index.html");
});

Deno.test("queryTag is empty for no query", () => {
	assertEquals(queryTag(""), "");
	assertEquals(queryTag("?"), "");
	assertEquals(queryTag("?a=1"), queryTag("a=1"));
});

Deno.test("hrefFor gives the URL a written file is served at", () => {
	assertEquals(hrefFor("index.html"), "/");
	assertEquals(hrefFor("about/index.html"), "/about/");
	assertEquals(hrefFor("badge.a1b2c3.svg"), "/badge.a1b2c3.svg");
	assertEquals(hrefFor("about.html"), "/about.html");
});

Deno.test("writeResponse keeps one file per query", async () => {
	const outDir = await Deno.makeTempDir();
	try {
		const svg = (label: string) =>
			new Response(`<svg>${label}</svg>`, { headers: { "Content-Type": "image/svg+xml" } });

		const one = await writeResponse(
			svg("one"),
			new URL("http://localhost/badge?label=one"),
			{ outDir },
		);
		const two = await writeResponse(
			svg("two"),
			new URL("http://localhost/badge?label=two"),
			{ outDir },
		);

		assertEquals(one.file !== two.file, true);
		assertEquals(await Deno.readTextFile(joinPath(outDir, one.file)), "<svg>one</svg>");
		assertEquals(await Deno.readTextFile(joinPath(outDir, two.file)), "<svg>two</svg>");
	} finally {
		await Deno.remove(outDir, { recursive: true });
	}
});
