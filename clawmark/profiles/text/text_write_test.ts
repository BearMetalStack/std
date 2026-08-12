import { assertEquals } from "@std/assert";
import { markdownWith } from "../../mod.ts";
import { textWriter } from "./mod.ts";

function text(md: string, options?: Parameters<typeof textWriter>[0]): string {
	const result = markdownWith(md, textWriter(options));
	return result.parts[result.primary];
}

function words(md: string): number {
	const matches = text(md).trim().match(/\S+/g);
	return matches ? matches.length : 0;
}

Deno.test("plain paragraphs separate with the block separator", () => {
	assertEquals(
		text("First paragraph.\n\nSecond paragraph."),
		"First paragraph.\n\nSecond paragraph.\n\n",
	);
});

Deno.test("inline formatting contributes no markup, just the text", () => {
	assertEquals(
		text("Some **bold** and *italic* and ~~struck~~ text."),
		"Some bold and italic and struck text.\n\n",
	);
});

Deno.test("a heading is its own block", () => {
	assertEquals(text("# Title\n\nBody."), "Title\n\nBody.\n\n");
});

Deno.test("a horizontal rule contributes no text but does not merge its neighbors", () => {
	assertEquals(words("Before.\n\n---\n\nAfter."), 2);
});

Deno.test("blockquote lines separate from each other", () => {
	assertEquals(text("> Line one\n> Line two"), "Line one\n\nLine two\n\n");
});

Deno.test("list items separate, including a nested list under one item", () => {
	assertEquals(
		text("- one\n- two\n  - nested\n- three"),
		"one\n\ntwo\n\nnested\n\nthree\n\n",
	);
});

Deno.test("a code block's content is preserved verbatim", () => {
	assertEquals(text("```\nconst x = 1;\n```"), "const x = 1;\n\n");
});

Deno.test("inline code contributes its text, no fences", () => {
	assertEquals(text("Run `deno test` now."), "Run deno test now.\n\n");
});

Deno.test("a link contributes its link text, not the destination", () => {
	assertEquals(
		text("Read [the docs](https://example.com/very/long/path) today."),
		"Read the docs today.\n\n",
	);
});

Deno.test("an image contributes nothing - no alt text, no src", () => {
	assertEquals(text("Before ![a cat](cat.png) after."), "Before  after.\n\n");
});

Deno.test("a footnote reference contributes nothing; its definition is its own block", () => {
	assertEquals(
		text("A claim.[^1]\n\n[^1]: The evidence."),
		"A claim.\n\nThe evidence.\n\n",
	);
});

Deno.test("a table row joins its cells with a space", () => {
	assertEquals(text("| a | b |\n|---|---|\n| c | d |"), "a b\n\nc d\n\n");
});

Deno.test("a manual line break keeps its neighbors apart", () => {
	assertEquals(words("one\\\ntwo"), 2);
});

Deno.test("blockSeparator is configurable", () => {
	assertEquals(text("First.\n\nSecond.", { blockSeparator: " / " }), "First. / Second. / ");
});

Deno.test("word count survives markup that would otherwise inflate or hide it", () => {
	assertEquals(words("# A **Bold** Heading\n\nWith a [link](http://x) and `code`."), 8);
});
