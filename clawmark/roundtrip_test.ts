import { assertEquals } from "@std/assert";
import { htmlToMarkdown, toHtml } from "./mod.ts";

function normalize(md: string): string {
	return md.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** md -> html -> md. Lossy in known ways; `expected` names them. */
function assertRoundTrip(md: string, expected = md) {
	assertEquals(normalize(htmlToMarkdown(toHtml(md))), normalize(expected));
}

/**
 * html -> md -> html. The stronger invariant, and the one that actually
 * matters: it tolerates cosmetic spelling differences (`_a_` vs `*a*`, list
 * renumbering) automatically, because both render to identical HTML.
 */
function assertHtmlStable(md: string) {
	const html = toHtml(md);
	assertEquals(toHtml(htmlToMarkdown(html)), html);
}

function assertBoth(md: string, expected = md) {
	assertRoundTrip(md, expected);
	assertHtmlStable(md);
}

// ---- the full mod_test.ts construct inventory -----------------------------

Deno.test("round trip: paragraph", () => assertBoth("Hello world"));
Deno.test("round trip: two paragraphs", () => assertBoth("First\n\nSecond"));
Deno.test("round trip: headings", () => {
	assertBoth("# One");
	assertBoth("###### Six");
	assertBoth("# Title\n\nBody text");
});
Deno.test("round trip: emphasis", () => assertBoth("*a* **c** ***d***"));
Deno.test("round trip: strikethrough and highlight", () => assertBoth("~~gone~~ ==important=="));
Deno.test("round trip: underline", () => assertBoth("++under++ ++***all three***++"));
Deno.test("round trip: inline code", () => assertBoth("`*not bold*`"));
Deno.test("round trip: code block", () => assertBoth("```\nconst x = 1;\n```"));
Deno.test("round trip: code block with a language", () => assertBoth("```ts\nconst x = 1;\n```"));
Deno.test("round trip: link", () => {
	assertBoth('[click here](https://example.com "Example")');
});
Deno.test("round trip: image", () => assertBoth("![alt text](img.png)"));
Deno.test("round trip: hr", () => assertBoth("above\n\n---\n\nbelow"));
Deno.test("round trip: blockquote", () => assertBoth("> line one\n> line two"));
Deno.test("round trip: flat unordered list", () => assertBoth("- a\n- b"));
Deno.test("round trip: nested unordered list", () => assertBoth("- a\n  - b\n- c"));
Deno.test("round trip: ordered list", () => assertBoth("1. a\n2. b"));
Deno.test("round trip: checklist", () => assertBoth("- [x] done\n- [ ] todo"));
Deno.test("round trip: table with alignment", () => assertBoth("|a|b|\n|:-|-:|\n|1|2|"));
Deno.test("round trip: footnote", () => assertBoth("noted[^1]\n\n[^1]: the note"));

// ---- documented lossy cases -----------------------------------------------

Deno.test("lossy: `_a_` normalizes to `*a*`", () => {
	assertRoundTrip("_b_", "*b*");
	assertHtmlStable("_b_");
});

Deno.test("lossy: ordered lists renumber from 1", () => {
	// orderedListRule.validate calls discardBuffer(), so the author's digits
	// never reach the tree in the first place.
	assertRoundTrip("3. a\n4. b", "1. a\n2. b");
	assertHtmlStable("3. a\n4. b");
});

Deno.test("lossy: a soft wrap collapses to a space", () => {
	assertRoundTrip("First\nSecond", "First Second");
});

Deno.test("lossy: a header-only table cannot recover its alignment", () => {
	// tableRowRule.renderOpen forces text-align:center on every <th>, so the
	// alignment row is only recoverable from a body row. The delimiter row is
	// still synthesized - without one there is no table at all - it just falls
	// back to left.
	assertRoundTrip("|a|b|\n|:-|-:|", "|a|b|\n|:-|:-|");
});

// ---- surprising successes worth pinning -----------------------------------

Deno.test("raw html round-trips exactly: clawmark has no raw-html rule", () => {
	assertBoth("<script>alert(1)</script>");
});

Deno.test("markup inside link text stays opaque", () => assertBoth("[**a**](x)"));

// ---- ordinary HTML, not clawmark's own output -----------------------------

Deno.test("html: structural wrappers unwrap", () => {
	assertEquals(htmlToMarkdown("<div><section><p>hi</p></section></div>").trim(), "hi");
});

Deno.test("html: head and script subtrees are dropped", () => {
	assertEquals(
		htmlToMarkdown("<head><title>t</title></head><body><p>hi</p></body>").trim(),
		"hi",
	);
});

Deno.test("html: pretty-printed indentation does not leak into the output", () => {
	const html = `
		<div>
			<p>First</p>
			<p>Second</p>
		</div>
	`;
	assertEquals(htmlToMarkdown(html).trim(), "First\n\nSecond");
});

Deno.test("html: whitespace between inline elements is kept", () => {
	assertEquals(htmlToMarkdown("<p><b>a</b> <i>b</i></p>").trim(), "**a** *b*");
});

Deno.test("html: whitespace between blocks is not kept", () => {
	assertEquals(htmlToMarkdown("<p>a</p> <p>b</p>").trim(), "a\n\nb");
});

Deno.test("html: <strong><em>> folds to a single bolditalic", () => {
	assertEquals(htmlToMarkdown("<p><strong><em>d</em></strong></p>").trim(), "***d***");
});

Deno.test("html: a paragraph inside a list item does not break the list", () => {
	assertEquals(htmlToMarkdown("<ul><li><p>a</p></li><li><p>b</p></li></ul>").trim(), "- a\n- b");
});

Deno.test("html: nested lists indent", () => {
	assertEquals(
		htmlToMarkdown("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>").trim(),
		"- a\n  - b\n- c",
	);
});

Deno.test("html: <pre> preserves its internal whitespace", () => {
	assertEquals(
		htmlToMarkdown("<pre><code>a\n  indented\n</code></pre>").trim(),
		"```\na\n  indented\n```",
	);
});

Deno.test("html: entities are decoded into the markdown", () => {
	assertEquals(htmlToMarkdown("<p>a &amp; b &mdash; c</p>").trim(), "a & b — c");
});

Deno.test("html: text that looks like markdown gets escaped", () => {
	// Round-trips because the escape is real - see rules/linebreak.ts.
	const md = htmlToMarkdown("<p>2 * 3 * 4</p>");
	assertEquals(toHtml(md), "<p>2 * 3 * 4</p>");
});

Deno.test("html: a heading marker in body text is escaped", () => {
	const md = htmlToMarkdown("<p># not a heading</p>");
	assertEquals(toHtml(md), "<p># not a heading</p>");
});

// ---- unmatched policies ---------------------------------------------------

Deno.test("policy: unmatched defaults to unwrap", () => {
	assertEquals(htmlToMarkdown("<p>a <custom>b</custom> c</p>").trim(), "a b c");
});

Deno.test("policy: raw emits the element verbatim", () => {
	assertEquals(
		htmlToMarkdown("<p>a</p><video src='v.mp4'></video>", {
			unmatchedByTag: { video: "raw" },
		}).trim(),
		'a\n\n<video src="v.mp4"></video>',
	);
});

Deno.test("policy: drop discards the subtree", () => {
	assertEquals(
		htmlToMarkdown("<p>a</p><aside2>gone</aside2>", { unmatchedByTag: { aside2: "drop" } })
			.trim(),
		"a",
	);
});

Deno.test("policy: a callback can decide per element", () => {
	const md = htmlToMarkdown("<p>a</p><x-thing>b</x-thing>", {
		unmatched: (el) => el.name.startsWith("x-") ? { kind: "drop" } : null,
	});
	assertEquals(md.trim(), "a");
});
