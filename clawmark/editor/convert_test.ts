import { assertEquals, assertStringIncludes } from "@std/assert";
import { defaultRules } from "../rules/mod.ts";
import { editorRules } from "./annotate.ts";
import { markdownToRich, richToMarkdown, sanitizeHtml } from "./convert.ts";

const rules = () => editorRules(defaultRules());

const CASES: Record<string, string> = {
	paragraph: "Hello world\n",
	heading: "## A heading\n",
	bold: "some **bold** text\n",
	italic: "some *italic* text\n",
	strike: "some ~~struck~~ text\n",
	code: "use `code` here\n",
	link: "a [link](https://example.com) here\n",
	quote: "> quoted\n",
	list: "- one\n- two\n",
	ordered: "1. one\n2. two\n",
	fence: "```ts\nconst a = 1;\n```\n",
};

for (const [name, md] of Object.entries(CASES)) {
	Deno.test(`editor convert: ${name} survives markdown -> rich -> markdown`, () => {
		const r = rules();
		assertEquals(richToMarkdown(markdownToRich(md, r), r), md);
	});
}

Deno.test("editor convert: contenteditable filler <br> does not leak into markdown", () => {
	assertEquals(richToMarkdown("<p>hi</p><p><br></p>", rules()).trim(), "hi");
});

Deno.test("editor convert: sanitizer strips scripts, handlers and script URLs", () => {
	const out = sanitizeHtml(
		`<p onclick="x()">a<script>alert(1)</script><a href="java\tscript:alert(1)">b</a><iframe src="x"></iframe></p>`,
	);
	assertEquals(out.includes("script"), false);
	assertEquals(out.includes("onclick"), false);
	assertEquals(out.includes("iframe"), false);
	assertStringIncludes(out, "<p>a");
});

Deno.test("editor convert: the rich view never receives raw script from markdown", () => {
	const r = rules();
	assertEquals(markdownToRich("<script>alert(1)</script>\n\nhi", r).includes("<script"), false);
});
