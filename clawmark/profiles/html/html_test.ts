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
