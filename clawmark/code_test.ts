import { assertEquals } from "@std/assert";
import { parse, toMarkdown } from "./mod.ts";
import type { Node } from "./types.ts";

const find = (node: Node, tag: string): Node[] =>
	node.tag === tag ? [node] : node.children.flatMap((c) => find(c, tag));
const data = (src: string, tag: string) => find(parse(src), tag).map((n) => n.data);

Deno.test("code: a longer fence holds a shorter one", () => {
	assertEquals(data("````md\n```ts [a.ts]\nx\n```\n````\n", "md:codeblock"), [
		{ value: "```ts [a.ts]\nx\n```", lang: "md" },
	]);
});

Deno.test("code: a fence closes on a line of at least its length", () => {
	assertEquals(data("```\na\n````\nafter", "md:codeblock"), [{ value: "a" }]);
	assertEquals(data("````\na\n```\nb\n````", "md:codeblock"), [{ value: "a\n```\nb" }]);
});

Deno.test("code: an unclosed fence falls back to the next three backticks", () => {
	assertEquals(data("```js\nx```", "md:codeblock"), [{ value: "x", lang: "js" }]);
	assertEquals(data("````\nnever closed", "md:codeblock"), []);
});

Deno.test("code: inline spans close on a run of the same length", () => {
	assertEquals(data("Write `` ```ts [a.ts] `` here", "md:code"), [{ value: "```ts [a.ts]" }]);
	assertEquals(data("``a ` b``", "md:code"), [{ value: "a ` b" }]);
	assertEquals(data("`a` and `b`", "md:code"), [{ value: "a" }, { value: "b" }]);
	assertEquals(data("x `` y", "md:code"), []);
});

Deno.test("code: what serialize writes reads back", () => {
	for (const src of ["`` `a` ``", "````md\n```ts\nx\n```\n````", "`` a`b ``"]) {
		const tree = parse(src);
		assertEquals(parse(toMarkdown(tree)).children.length, tree.children.length);
		assertEquals(toMarkdown(parse(toMarkdown(tree))), toMarkdown(tree));
	}
	assertEquals(data(toMarkdown(parse("`` `a` ``")), "md:code"), [{ value: "`a`" }]);
});
