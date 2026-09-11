import { assertEquals } from "@std/assert";
import { parse, toHtml, toMarkdown } from "./mod.ts";

/**
 * The serializer's core property, validated with no XML machinery in the loop:
 * markdown parsed into a tree and written back out is a fixed point.
 */
function assertStable(md: string, expected = md) {
	assertEquals(toMarkdown(parse(md)).trimEnd(), expected);
}

/** Weaker but still useful: the rendered HTML is unchanged by a round trip. */
function assertHtmlStable(md: string) {
	assertEquals(toHtml(toMarkdown(parse(md))), toHtml(md));
}

// ---- blocks ---------------------------------------------------------------

Deno.test("serialize: paragraph", () => assertStable("Hello world"));

Deno.test("serialize: two paragraphs keep one blank line", () => {
	assertStable("First\n\nSecond");
});

Deno.test("serialize: headings h1-h6", () => {
	assertStable("# One");
	assertStable("###### Six");
	assertStable("# Title\n\nBody text");
});

Deno.test("serialize: hr", () => assertStable("above\n\n---\n\nbelow"));

// ---- inline ---------------------------------------------------------------

Deno.test("serialize: emphasis", () => {
	assertStable("*a* **c** ***d***");
	// `_b_` and `*b*` both lex to md:italic, so the serializer picks one
	// spelling. The HTML is identical, which is what assertHtmlStable checks.
	assertStable("_b_", "*b*");
	assertHtmlStable("_b_");
});

Deno.test("serialize: strikethrough and highlight", () => {
	assertStable("~~gone~~ ==important==");
});

Deno.test("serialize: inline code is not re-escaped inside", () => {
	assertStable("`*not bold*`");
});

Deno.test("serialize: inline code containing a backtick grows its fence", () => {
	assertHtmlStable("``a ` b``");
});

Deno.test("serialize: hard line break", () => assertHtmlStable("a\\\nb"));

// ---- links and images -----------------------------------------------------

Deno.test("serialize: link with and without a title", () => {
	assertStable('[click here](https://example.com "Example")');
	assertStable("[text](https://example.com)");
});

Deno.test("serialize: image", () => assertStable("![alt text](img.png)"));

Deno.test("serialize: a space in a link destination is percent-encoded", () => {
	assertHtmlStable("[a](my file.png)");
});

// ---- code -----------------------------------------------------------------

Deno.test("serialize: code block", () => assertStable("```\nconst x = 1;\n```"));

Deno.test("serialize: code block keeps its language", () => {
	assertStable("```ts\nconst x = 1;\n```");
});

Deno.test("serialize: code block fence outgrows inner backticks", () => {
	// Not reachable from markdown: the forward fence is hardcoded to exactly
	// three backticks, so no source text can express this block. It matters for
	// trees built from HTML, where `<pre><code>` has no such limit.
	const tree = {
		tag: "core:root" as const,
		data: {},
		children: [{
			tag: "md:codeblock" as const,
			data: { value: "a ``` b" },
			children: [],
		}],
	};
	assertEquals(toMarkdown(tree).trimEnd(), "````\na ``` b\n````");
});

// ---- blockquotes ----------------------------------------------------------

Deno.test("serialize: blockquote", () => assertStable("> line one\n> line two"));

Deno.test("serialize: nested blockquote", () => assertHtmlStable("> > deep"));

// ---- lists ----------------------------------------------------------------

Deno.test("serialize: flat unordered list", () => assertStable("- a\n- b"));

Deno.test("serialize: nested unordered list", () => assertStable("- a\n  - b\n- c"));

Deno.test("serialize: ordered list renumbers from 1", () => {
	assertStable("1. a\n2. b");
	// Ordinals never reach the tree - orderedListRule.validate discards the
	// digits - so an author's `3.` cannot be recovered.
	assertStable("3. a\n4. b", "1. a\n2. b");
	assertHtmlStable("3. a\n4. b");
});

Deno.test("serialize: checklist", () => assertStable("- [x] done\n- [ ] todo"));

// ---- tables ---------------------------------------------------------------

Deno.test("serialize: table with alignment", () => {
	assertStable("|a|b|\n|:-|-:|\n|1|2|");
});

Deno.test("serialize: table without an explicit format row gains one", () => {
	assertHtmlStable("|a|b|\n|:-|:-|\n|1|2|");
});

// ---- footnotes ------------------------------------------------------------

Deno.test("serialize: footnote reference and definition", () => {
	assertStable("noted[^1]\n\n[^1]: the note");
});

// ---- escaping -------------------------------------------------------------

Deno.test("escape: inline markers are escaped and read back as literals", () => {
	for (const raw of ["a*b", "a_b", "a`b", "a[b]c", "a\\b"]) {
		const md = toMarkdown(parse(raw.replaceAll("\\", "\\\\")));
		assertEquals(toMarkdown(parse(md)).trimEnd(), md.trimEnd());
	}
});

Deno.test("escape: literal asterisks survive a round trip", () => {
	// Without the backslash-escape rule this silently produced <em> instead.
	assertEquals(toHtml("2 \\* 3 \\* 4"), "<p>2 * 3 * 4</p>");
	assertHtmlStable("2 \\* 3 \\* 4");
});

Deno.test("escape: a line-start marker in text is escaped, mid-line is not", () => {
	assertEquals(toHtml("\\# not a heading"), "<p># not a heading</p>");
	assertHtmlStable("\\# not a heading");
	// `#` mid-line starts nothing, so it must not be escaped.
	assertStable("a # b");
});

Deno.test("escape: doubled ~ and = are escaped, singles are not", () => {
	assertStable("a ~ b");
	assertStable("a = b");
	assertHtmlStable("a \\~\\~b");
});

// ---- surprising successes worth pinning -----------------------------------

Deno.test("raw html has no rule, so angle brackets need no escaping", () => {
	assertStable("<script>alert(1)</script>");
	assertEquals(toHtml("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
});

Deno.test("markup inside link text is real markup, not opaque text", () => {
	assertStable("[**a**](x)");
	assertEquals(toHtml("[**a**](x)"), '<p><a href="x"><strong>a</strong></a></p>');
});

// ---- normalization --------------------------------------------------------

Deno.test("a soft wrap collapses to a space, irreversibly", () => {
	assertStable("First\nSecond", "First Second");
	assertHtmlStable("First\nSecond");
});

Deno.test("output ends with exactly one newline", () => {
	assertEquals(toMarkdown(parse("x")), "x\n");
	assertEquals(toMarkdown(parse("x"), undefined, { eof: "" }), "x");
});
