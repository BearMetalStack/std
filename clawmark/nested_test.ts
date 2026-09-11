/**
 * Nested inline construct rendering.
 *
 * `md:link`, `md:image`, and a table cell used to resolve their content in a
 * single `tokenize()` call - a regex over a bracket span, or a bare
 * `.split("|")` - rather than by staying open on the lexer's own
 * per-character loop the way emphasis/blockquote/list do. Nothing inside them
 * ever got a chance to be recognized as its own construct, so an image
 * wrapped by a link, or a link inside a table cell, rendered as broken or
 * literal text instead of real markup. See rules/link.ts, rules/image.ts,
 * and rules/table.ts for the fix; this file is the regression suite for it.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromHtml, htmlToMarkdown, parse, toHtml, toMarkdown } from "./mod.ts";

function stable(md: string): string {
	return toMarkdown(parse(md)).trimEnd();
}

// ---- link text: real nested markup, not an opaque string ------------------

Deno.test("link text: an image wrapped by a link renders as a real <img>", () => {
	assertEquals(
		toHtml("[![alt](img.png)](https://example.com)"),
		'<p><a href="https://example.com"><img src="img.png" alt="alt"></a></p>',
	);
});

Deno.test("link text: an image wrapped by a link round-trips through markdown", () => {
	assertEquals(
		stable("[![alt](img.png)](https://example.com)"),
		"[![alt](img.png)](https://example.com)",
	);
});

Deno.test("link text: an href containing its own `(` and `)` no longer corrupts the link", () => {
	// The pre-fix bug used the *nearest* `(`/`)` to bound the link, so a
	// bracket-bearing construct nested in the text (an image) truncated the
	// href and leaked the rest of the line as literal text - regardless of
	// whether the href itself had parens. This pins the minimal repro.
	const html = toHtml("[![alt](img.png)](https://example.com)");
	assertStringIncludes(html, 'href="https://example.com"');
	assertStringIncludes(html, '<img src="img.png" alt="alt">');
});

Deno.test("link text: emphasis, strikethrough, and inline code all nest", () => {
	assertEquals(toHtml("[**bold**](x)"), '<p><a href="x"><strong>bold</strong></a></p>');
	assertEquals(toHtml("[*italic*](x)"), '<p><a href="x"><em>italic</em></a></p>');
	assertEquals(toHtml("[~~gone~~](x)"), '<p><a href="x"><s>gone</s></a></p>');
	assertEquals(toHtml("[`code`](x)"), '<p><a href="x"><code>code</code></a></p>');
});

Deno.test("link text: a bold run that closes at the very end of the text still closes", () => {
	// Regression for a latent bug in emphasis.ts's runLength(): peek(3) hits
	// the lexer's EOF sentinel the instant fewer than 3 characters remain,
	// even when 1 or 2 real ones do, so a closing run flush against the end
	// of a span (exactly what link text and table cells commonly are) read
	// as length 1 and never actually closed the bold.
	assertEquals(toHtml("[**bold**](x)"), '<p><a href="x"><strong>bold</strong></a></p>');
	assertEquals(stable("[**bold**](x)"), "[**bold**](x)");
});

Deno.test("link text: a link may not itself contain another link", () => {
	// CommonMark disallows a link inside link text; an inner `[...]` just
	// falls through to literal text rather than becoming a second md:link
	// (or looping/crashing).
	assertEquals(
		toHtml("[outer [inner](b) text](a)"),
		'<p><a href="a">outer [inner](b) text</a></p>',
	);
});

Deno.test("link text: plain links are unaffected", () => {
	assertEquals(
		toHtml('[click here](https://example.com "Example")'),
		'<p><a href="https://example.com" title="Example">click here</a></p>',
	);
	assertEquals(
		stable('[click here](https://example.com "Example")'),
		'[click here](https://example.com "Example")',
	);
});

Deno.test("link text (reverse): an <img> inside an <a> survives htmlToMarkdown", () => {
	assertEquals(
		htmlToMarkdown('<a href="url"><img src="i.png" alt="alt text"></a>').trim(),
		"[![alt text](i.png)](url)",
	);
});

Deno.test("link text (reverse): fromHtml builds a real md:image child, not flattened text", () => {
	const tree = fromHtml('<p><a href="url"><img src="i.png" alt="a"></a></p>');
	const link = tree.children[0].children[0];
	assertEquals(link.tag, "md:link");
	assertEquals(link.children.length, 1);
	assertEquals(link.children[0].tag, "md:image");
});

// ---- table cells: real nested markup, not an opaque string ----------------

Deno.test("table cell: a link renders as a real <a>, not literal text", () => {
	assertEquals(
		toHtml("|[text](url)|foo|\n|:-|:-|\n|a|b|"),
		"<table>" +
			'<thead><tr><th style="text-align:center"><a href="url">text</a></th>' +
			'<th style="text-align:center">foo</th></tr></thead>' +
			'<tr><td style="text-align:left">a</td><td style="text-align:left">b</td></tr>' +
			"</table>",
	);
});

Deno.test("table cell: a link round-trips through markdown", () => {
	assertEquals(stable("|[text](url)|foo|\n|:-|:-|\n|a|b|"), "|[text](url)|foo|\n|:-|:-|\n|a|b|");
});

Deno.test("table cell: an image renders as a real <img>", () => {
	assertStringIncludes(toHtml("|![alt](i.png)|foo|\n|:-|:-|"), '<img src="i.png" alt="alt">');
});

Deno.test("table cell: emphasis renders and round-trips", () => {
	assertStringIncludes(toHtml("|**bold**|foo|\n|:-|:-|"), "<strong>bold</strong>");
	assertEquals(stable("|**bold**|foo|\n|:-|:-|"), "|**bold**|foo|\n|:-|:-|");
});

Deno.test("table cell: plain cells are unaffected", () => {
	assertEquals(stable("|a|b|\n|:-|-:|\n|1|2|"), "|a|b|\n|:-|-:|\n|1|2|");
});

Deno.test("table cell (reverse): a link inside a <td> survives htmlToMarkdown", () => {
	assertEquals(
		htmlToMarkdown(
			'<table><tr><td><a href="url">text</a></td><td>foo</td></tr></table>',
		).trim(),
		"|[text](url)|foo|\n|:-|:-|",
	);
});

Deno.test("table cell (reverse): fromHtml builds a real md:link child, not flattened text", () => {
	const tree = fromHtml('<table><tr><td><a href="url">text</a></td></tr></table>');
	const table = tree.children[0];
	const row = table.children[0];
	const cell = row.children[0];
	assertEquals(cell.tag, "md:tablecell");
	assertEquals(cell.children[0].tag, "md:link");
});

// ---- a rule set narrower than defaultRules() is still safe -----------------

Deno.test("a bare `---`/`___` inside link text or a table cell doesn't crash the parser", () => {
	// hrRule is excluded from the inline-only rule set handed to a sub-parse
	// (it's a block construct), but the emphasis trigger rules' shared
	// tokenize() can still emit an md:hr token for a bare "___" run - if hrRule
	// weren't kept around regardless, the tree builder would have no rule to
	// resolve that tag against and throw instead of degrading.
	toHtml("[___](x)");
	toHtml("|___|foo|\n|:-|:-|");
});
