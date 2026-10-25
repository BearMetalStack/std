import { assertEquals, assertStringIncludes } from "@std/assert";
import { parse, toHtml, toMarkdown } from "../../mod.ts";
import { defaultRules } from "../mod.ts";
import type { Node, StagedRule } from "../../types.ts";
import {
	COMPONENT_TAG,
	CONTAINER_TAG,
	CONTAINER_TITLE_TAG,
	docsRules,
	WIKILINK_TAG,
} from "./docs.ts";

const rules = (): StagedRule[] => [...docsRules(), ...defaultRules()];

function find(node: Node, tag: string, out: Node[] = []): Node[] {
	if (node.tag === tag) out.push(node);
	for (const child of node.children) find(child, tag, out);
	return out;
}

function text(node: Node): string {
	if (node.tag === "core:text") return (node.data as { value: string }).value;
	return node.children.map(text).join("");
}

// ---- containers -----------------------------------------------------------

Deno.test("container: kind, inline title and block body", () => {
	const tree = parse(
		"::: tip Reads are **subscriptions**\nOne.\n\n- a\n- b\n:::\n\nAfter.",
		rules(),
	);
	const [box] = find(tree, CONTAINER_TAG);
	assertEquals(box.data, { kind: "tip", title: "Reads are **subscriptions**" });
	assertEquals(box.children[0].tag, CONTAINER_TITLE_TAG);
	assertEquals(find(box.children[0], "md:bold").length, 1);
	assertEquals(find(box, "md:list").length + find(box, "md:unorderedlist").length > 0, true);
	assertStringIncludes(toHtml("::: tip\nx\n:::\n\nAfter.", rules()), "After.");
});

Deno.test("container: no title means no title child", () => {
	const [box] = find(parse("::: steps\n### One\nbody\n:::", rules()), CONTAINER_TAG);
	assertEquals(box.data, { kind: "steps", title: "" });
	assertEquals(box.children[0].tag === CONTAINER_TITLE_TAG, false);
	assertEquals(find(box, "md:heading").length, 1);
});

Deno.test("container: nesting pairs openers with their own closers", () => {
	const src =
		"::: steps\n### Install\n::: code-group\n```sh [deno]\ndeno add x\n```\n:::\n### Run\nok\n:::\n\ntail";
	const tree = parse(src, rules());
	const boxes = find(tree, CONTAINER_TAG);
	assertEquals(boxes.map((b) => (b.data as { kind: string }).kind), ["steps", "code-group"]);
	assertEquals(find(boxes[0], "md:heading").length, 2);
	assertStringIncludes(text(tree), "tail");
});

Deno.test("container: a ::: inside fenced code is code", () => {
	const src = "::: info\n```txt\n:::\n```\n:::\n\nafter";
	const tree = parse(src, rules());
	const [box] = find(tree, CONTAINER_TAG);
	const [code] = find(box, "md:codeblock");
	assertEquals((code.data as { value: string }).value, ":::");
	assertStringIncludes(text(tree), "after");
});

Deno.test("container: unclosed runs to the end", () => {
	const [box] = find(parse("::: warning\nstill inside", rules()), CONTAINER_TAG);
	assertStringIncludes(text(box), "still inside");
});

Deno.test("container: renders as a block, not inside a paragraph", () => {
	const html = toHtml("::: danger Careful\nHot.\n:::", rules());
	assertEquals(html.startsWith('<div class="container danger"><p class="container-title">'), true);
});

Deno.test("container: markdown round trip", () => {
	const src = "::: tip Prefer a **template**?\nRun it.\n\n- one\n:::";
	const once = toMarkdown(parse(src, rules()), rules());
	assertEquals(toMarkdown(parse(once, rules()), rules()), once);
	assertStringIncludes(once, "::: tip Prefer a **template**?");
});

// ---- wiki links -----------------------------------------------------------

Deno.test("wikilink: target and optional label", () => {
	const tree = parse("Reads a [[signal]] or [[owner|its owner]], not [a link](/x).", rules());
	const links = find(tree, WIKILINK_TAG).map((n) => n.data);
	assertEquals(links, [{ target: "signal" }, { target: "owner", label: "its owner" }]);
	assertEquals(find(tree, "md:link").length, 1);
});

Deno.test("wikilink: round trip and html", () => {
	const src = "See [[batch|batching]] and [[effect]].";
	assertEquals(toMarkdown(parse(src, rules()), rules()).trim(), src);
	assertStringIncludes(
		toHtml(src, rules()),
		'<span class="wikilink" data-target="batch">batching</span>',
	);
});

// ---- heading ids ----------------------------------------------------------

Deno.test("heading ids: slugged from text, repeats numbered", () => {
	const tree = parse("## The `mental` model\n\n## Notes\n\n### Notes\n\n## Ünïcode ok", rules());
	assertEquals(find(tree, "md:heading").map((h) => (h.data as { id: string }).id), [
		"the-mental-model",
		"notes",
		"notes-1",
		"ünïcode-ok",
	]);
	assertStringIncludes(toHtml("## Hello there", rules()), '<h2 id="hello-there">');
});

Deno.test("heading ids: counters are per document", () => {
	const r = rules();
	parse("## Same", r);
	const [h] = find(parse("## Same", r), "md:heading");
	assertEquals((h.data as { id: string }).id, "same");
});

// ---- inline components ----------------------------------------------------

Deno.test("component: self-closing capitalized tags with string props", () => {
	const tree = parse('Renamed <Badge type="warn" text="deprecated alias"/> today.', rules());
	const [c] = find(tree, COMPONENT_TAG);
	assertEquals(c.data, { name: "Badge", props: { type: "warn", text: "deprecated alias" } });
	assertStringIncludes(
		toHtml('<Badge type="warn" text="x"/>', rules()),
		'<span data-component="Badge" data-type="warn" data-text="x">x</span>',
	);
	assertEquals(
		toMarkdown(parse('a <Badge type="info" text="b"/> c', rules()), rules()).trim(),
		'a <Badge type="info" text="b"/> c',
	);
});

Deno.test("component: lowercase and open tags are left alone", () => {
	const tree = parse("a <br/> b <Badge> c", rules());
	assertEquals(find(tree, COMPONENT_TAG).length, 0);
});

// ---- code info strings ----------------------------------------------------

Deno.test("code: info string carries a label and meta", () => {
	const [code] = find(parse("```tsx [app.tsx] {1,3}\nconst a = 1;\n```", rules()), "md:codeblock");
	assertEquals(code.data, { value: "const a = 1;", lang: "tsx", label: "app.tsx", meta: "1,3" });
	const [plain] = find(parse("```ts\nx\n```", rules()), "md:codeblock");
	assertEquals(plain.data, { value: "x", lang: "ts" });
});

Deno.test("code: labels round trip", () => {
	const src = "```sh [deno]\ndeno add x\n```";
	assertEquals(toMarkdown(parse(src, rules()), rules()).trim(), src);
});
