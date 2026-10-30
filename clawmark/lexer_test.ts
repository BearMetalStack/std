import { assertEquals } from "@std/assert";
import { toHtml } from "./mod.ts";
import { peekAt } from "./lexer.ts";

Deno.test("peek returns what remains when the lookahead runs past the end", () => {
	assertEquals(peekAt("ab", 0, 6), "ab");
	assertEquals(peekAt("ab", 1, 6), "b");
	assertEquals(peekAt("ab", 2, 1), "eof");
	assertEquals(peekAt("ab", 0, 0), "");
});

Deno.test("a heading at the very end of input keeps its level", () => {
	assertEquals(toHtml("### x"), "<h3>x</h3>");
	assertEquals(toHtml("## "), "<h2></h2>");
	assertEquals(toHtml("##"), "<h2></h2>");
});

Deno.test("a bold run closing at the very end of input closes", () => {
	assertEquals(toHtml("say **bold**"), "<p>say <strong>bold</strong></p>");
	assertEquals(toHtml("say ***both***"), "<p>say <strong><em>both</em></strong></p>");
});

Deno.test("trailing newlines do not change where paragraphs end", () => {
	assertEquals(toHtml("a\n"), toHtml("a"));
	assertEquals(toHtml("a\n\n"), toHtml("a"));
	assertEquals(toHtml("a\n\nb"), "<p>a</p><p>b</p>");
});
