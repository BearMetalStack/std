import { assertEquals } from "@std/assert";
import { toHtml } from "./mod.ts";

Deno.test("plain paragraph", () => {
	assertEquals(toHtml("Hello world"), "<p>Hello world</p>");
});

Deno.test("blank line separates paragraphs", () => {
	assertEquals(toHtml("First\n\nSecond"), "<p>First</p><p>Second</p>");
});

Deno.test("single newline is a soft space within a paragraph", () => {
	assertEquals(toHtml("First\nSecond"), "<p>First Second</p>");
});

Deno.test("headings h1-h6", () => {
	assertEquals(toHtml("# One"), "<h1>One</h1>");
	assertEquals(toHtml("###### Six"), "<h6>Six</h6>");
});

Deno.test("heading then paragraph", () => {
	assertEquals(toHtml("# Title\n\nBody text"), "<h1>Title</h1><p>Body text</p>");
});

Deno.test("emphasis: italic, bold, bolditalic", () => {
	assertEquals(
		toHtml("*a* _b_ **c** ***d***"),
		"<p><em>a</em> <em>b</em> <strong>c</strong> <strong><em>d</em></strong></p>",
	);
});

Deno.test("strikethrough and highlight", () => {
	assertEquals(
		toHtml("~~gone~~ ==important=="),
		'<p><s>gone</s> <span class="highlight">important</span></p>',
	);
});

Deno.test("inline code does not parse markup inside it", () => {
	assertEquals(toHtml("`*not bold*`"), "<p><code>*not bold*</code></p>");
});

Deno.test("code block", () => {
	assertEquals(
		toHtml("```\nconst x = 1;\n```"),
		'<pre class="code"><code>const x = 1;</code></pre>',
	);
});

Deno.test("link", () => {
	assertEquals(
		toHtml('[click here](https://example.com "Example")'),
		'<p><a href="https://example.com" title="Example">click here</a></p>',
	);
});

Deno.test("image", () => {
	assertEquals(toHtml("![alt text](img.png)"), '<p><img src="img.png" alt="alt text"></p>');
});

Deno.test("hr", () => {
	assertEquals(toHtml("above\n\n---\n\nbelow"), "<p>above</p><hr><p>below</p>");
});

Deno.test("blockquote", () => {
	assertEquals(
		toHtml("> line one\n> line two"),
		"<blockquote><p>line one</p><p>line two</p></blockquote>",
	);
});

Deno.test("flat unordered list", () => {
	assertEquals(
		toHtml("- a\n- b\n- c"),
		"<ul><li>a</li><li>b</li><li>c</li></ul>",
	);
});

Deno.test("nested unordered list", () => {
	assertEquals(
		toHtml("- a\n  - a1\n  - a2\n- b"),
		"<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>",
	);
});

Deno.test("ordered list", () => {
	assertEquals(
		toHtml("1. one\n2. two\n3. three"),
		"<ol><li>one</li><li>two</li><li>three</li></ol>",
	);
});

Deno.test("checklist", () => {
	assertEquals(
		toHtml("- [ ] todo\n- [x] done"),
		'<ul class="none"><li><input type="checkbox" disabled>todo</li>' +
			'<li><input type="checkbox" disabled checked>done</li></ul>',
	);
});

Deno.test("table with alignment", () => {
	const md = "|a|b|\n|:-|-:|\n|1|2|";
	assertEquals(
		toHtml(md),
		"<table><thead><tr>" +
			'<th style="text-align:center">a</th><th style="text-align:center">b</th>' +
			"</tr></thead>" +
			'<tr><td style="text-align:left">1</td><td style="text-align:right">2</td></tr>' +
			"</table>",
	);
});

Deno.test("footnote reference and definition", () => {
	assertEquals(
		toHtml("noted[^1]\n\n[^1]: the note"),
		'<p>noted<sup><a href="#fn-1" id="fnref-1">1</a></sup></p>' +
			'<aside id="1"><a href="#fnref-1">↩</a> the note</aside>',
	);
});

Deno.test("text is html-escaped", () => {
	assertEquals(toHtml("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
});
