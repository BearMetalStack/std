import { assertEquals } from "@std/assert";
import { splitBlocks } from "./mod.ts";

const texts = (md: string) => splitBlocks(md).map((b) => b.text);

Deno.test("splitBlocks splits on blank lines", () => {
	assertEquals(splitBlocks("a\n\nb"), [
		{ text: "a", start: 0, end: 1 },
		{ text: "b", start: 3, end: 4 },
	]);
	assertEquals(texts("\n\na\n\n\n\nb\n\n"), ["a", "b"]);
});

Deno.test("splitBlocks keeps a multi-line block whole", () => {
	assertEquals(texts("# T\n\n- a\n- b\n\n> q\n> r"), ["# T", "- a\n- b", "> q\n> r"]);
});

Deno.test("splitBlocks does not split a code fence at a blank line inside it", () => {
	assertEquals(texts("a\n\n```\nx\n\ny\n```\n\nb"), ["a", "```\nx\n\ny\n```", "b"]);
});

Deno.test("splitBlocks agrees with the lexer that a line of spaces is not blank", () => {
	assertEquals(texts("a\n \nb"), ["a\n \nb"]);
});

Deno.test("splitBlocks ranges index the source", () => {
	const md = "one\n\n## two\n\nthree";
	for (const block of splitBlocks(md)) assertEquals(md.slice(block.start, block.end), block.text);
});
