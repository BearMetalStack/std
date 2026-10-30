import { assertEquals } from "@std/assert";
import { parse } from "./mod.ts";
import { defaultRules } from "./rules/mod.ts";
import { docsRules } from "./rules/extra/docs.ts";
import type { Node, StagedRule } from "./types.ts";

/** Every node under the root as `tag: source text`, depth first. */
function read(source: string, rules?: StagedRule[]): string[] {
	const out: string[] = [];
	const walk = (node: Node) => {
		out.push(`${node.tag}: ${node.span ? source.slice(node.span.start, node.span.end) : "?"}`);
		node.children.forEach(walk);
	};
	parse(source, rules).children.forEach(walk);
	return out;
}

Deno.test("spans: inline toggles cover their delimiters", () => {
	assertEquals(read("say **bold** now"), [
		"core:paragraph: say **bold** now",
		"core:text: say ",
		"md:bold: **bold**",
		"core:text: bold",
		"core:text:  now",
	]);
});

Deno.test("spans: a heading runs from its marker to the end of its line", () => {
	assertEquals(read("## Title\n\nbody"), [
		"core:paragraph: ## Title",
		"md:heading: ## Title",
		"core:text: Title",
		"core:paragraph: body",
		"core:text: body",
	]);
});

Deno.test("spans: a list item ends where the next one starts", () => {
	const items = read("- a\n- b").filter((line) => line.startsWith("md:listitem"));
	assertEquals(items, ["md:listitem: - a\n", "md:listitem: - b"]);
});

Deno.test("spans: link text points into the document, not into the link", () => {
	assertEquals(read("see [*it*](x)"), [
		"core:paragraph: see [*it*](x)",
		"core:text: see ",
		"md:link: [*it*](x)",
		"md:italic: *it*",
		"core:text: it",
	]);
});

Deno.test("spans: table cells cover their own text, nesting included", () => {
	const lines = read("| a | **b** |\n| - | - |\n| [c](x) | d |");
	assertEquals(lines.filter((l) => /^md:(tablecell|tablerow|bold|link)/.test(l)), [
		"md:tablerow: | a | **b** |",
		"md:tablecell: a",
		"md:tablecell: **b**",
		"md:bold: **b**",
		"md:tablerow: | [c](x) | d |",
		"md:tablecell: [c](x)",
		"md:link: [c](x)",
		"md:tablecell: d",
	]);
});

Deno.test("spans: a container's body points into the document", () => {
	const lines = read("::: note A *t*\nin **b**\n:::", [...defaultRules(), ...docsRules()]);
	assertEquals(lines.filter((l) => /^md:(italic|bold)/.test(l)), [
		"md:italic: *t*",
		"md:bold: **b**",
	]);
});

Deno.test("spans: the soft-wrap space is read from the newline", () => {
	assertEquals(read("a\nb"), ["core:paragraph: a\nb", "core:text: a", "core:text: \nb"]);
});
