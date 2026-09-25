/**
 * Emphasis runs that butt up against each other.
 *
 * A three-character run is read as one token before the tree knows what is
 * open, so a bold closing straight into an italic (or the reverse) used to open
 * a bold-italic instead - and everything after it, paragraphs included, ended
 * up inside a mark that never closed.
 */
import { assertEquals } from "@std/assert";
import { parse, toHtml, toMarkdown } from "./mod.ts";

Deno.test("emphasis: a bold closing into an italic closes", () => {
	assertEquals(
		toHtml("**a***b* z\n\nnext"),
		"<p><strong>a</strong><em>b</em> z</p><p>next</p>",
	);
	assertEquals(
		toHtml("**a**_b_ z"),
		"<p><strong>a</strong><em>b</em> z</p>",
	);
});

Deno.test("emphasis: an italic closing into a bold closes", () => {
	assertEquals(
		toHtml("*a***b** z"),
		"<p><em>a</em><strong>b</strong> z</p>",
	);
});

Deno.test("emphasis: a nested bold closing with its italic, then a bold", () => {
	assertEquals(
		toHtml("*g**i*****k** z"),
		"<p><em>g<strong>i</strong></em><strong>k</strong> z</p>",
	);
});

Deno.test("emphasis: a real bold-italic is still one", () => {
	assertEquals(toHtml("***both*** z"), "<p><strong><em>both</em></strong> z</p>");
});

Deno.test("emphasis: adjacent marks round-trip", () => {
	for (const md of ["**a***b* z", "*a***b** z"]) {
		assertEquals(toHtml(toMarkdown(parse(md))), toHtml(md));
	}
});
