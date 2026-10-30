import { assertEquals } from "@std/assert";
import { defaultRules, fromHtml, htmlToMarkdown, markdownWith, toMarkdown } from "../../mod.ts";
import { htmlWriter } from "./mod.ts";

Deno.test("html read: default input mode is tolerant html (regression)", () => {
	// Unquoted attributes, uppercase tags - both recovered silently under the
	// default "html" input mode, same as before this option existed.
	assertEquals(htmlToMarkdown(`<UL><LI>a</LI><LI>b</LI></UL>`), "- a\n- b\n");
	assertEquals(htmlToMarkdown(`<div class=x><p>hi</p></div>`), "hi\n");
});

Deno.test("html read: xhtml input parses well-formed strict XHTML", () => {
	const xhtml =
		`<div xmlns="http://www.w3.org/1999/xhtml"><p>one<br/>two</p><hr/><ul><li>a</li><li>b</li></ul></div>`;
	// Well-formed input reverses the same way regardless of strictness.
	assertEquals(htmlToMarkdown(xhtml, { input: "xhtml" }), htmlToMarkdown(xhtml));
});

Deno.test("html read: xhtml input is case-sensitive, unlike the html default", () => {
	// Real XHTML is always lowercase - uppercase tags are invalid XHTML, and
	// strict mode does not fold case for you the way the tolerant default does.
	const upper = `<UL><LI>a</LI></UL>`;
	assertEquals(htmlToMarkdown(upper), "- a\n");
	// Neither <UL> nor <LI> matches the lowercase matchers, so the default
	// "unwrap" policy strips the structure down to plain text instead.
	assertEquals(htmlToMarkdown(upper, { input: "xhtml" }), "a\n");
});

Deno.test("html read: xhtml input round-trips htmlWriter's own xhtml output", () => {
	const source = "# Title\n\nBody with a line\\\nbreak.\n\n- one\n- two\n";
	const written =
		markdownWith(source, htmlWriter({ output: "xhtml" }), defaultRules()).parts["index.html"];
	assertEquals(
		toMarkdown(fromHtml(written, { input: "xhtml" })),
		toMarkdown(fromHtml(written)),
	);
});

Deno.test("html: a span that formats in CSS keeps its formatting", () => {
	assertEquals(htmlToMarkdown('<p><span style="font-weight:700">x</span> y</p>'), "**x** y\n");
	assertEquals(htmlToMarkdown('<p><span style="font-style:italic">x</span></p>'), "*x*\n");
	assertEquals(
		htmlToMarkdown('<p><span style="text-decoration:line-through">x</span></p>'),
		"~~x~~\n",
	);
	assertEquals(
		htmlToMarkdown('<p><span style="text-decoration:underline">x</span></p>'),
		"++x++\n",
	);
});

Deno.test("html: a styled span adds only what is not already in effect", () => {
	assertEquals(
		htmlToMarkdown('<p><b>a <span style="font-weight:bold">b</span></b></p>'),
		"**a b**\n",
	);
	assertEquals(
		htmlToMarkdown(
			'<p><span style="font-weight:700">a <span style="font-weight:700">b</span></span></p>',
		),
		"**a b**\n",
	);
});

Deno.test("html: Google Docs' not-bold wrapper does not bold the paste", () => {
	const paste = '<b style="font-weight:normal" id="docs-internal-guid-1">' +
		'<p><span style="font-weight:700">x</span> y</p></b>';
	assertEquals(htmlToMarkdown(paste), "**x** y\n");
});

Deno.test("html: a block's trailing filler <br> is dropped, a real one kept", () => {
	assertEquals(htmlToMarkdown("<p>a<br></p><p>b</p>"), "a\n\nb\n");
	assertEquals(htmlToMarkdown("<p>a<br>\n</p>"), "a\n");
	assertEquals(htmlToMarkdown("<p><b>a<br></b></p>"), "**a**\n");
	assertEquals(htmlToMarkdown("<p>a<br>b</p>"), "a\\\nb\n");
	assertEquals(htmlToMarkdown("<p><b>a<br></b>b</p>"), "**a\\\n**b\n");
});

Deno.test("html: keepTrailingBreaks keeps a block's trailing <br>", () => {
	assertEquals(htmlToMarkdown("<p>a<br></p>", { keepTrailingBreaks: true }), "a\\\n");
});
