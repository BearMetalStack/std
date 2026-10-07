import { assertEquals } from "@std/assert";
import {
	defaultRules,
	parse,
	postparse,
	preparse,
	splitStages,
	toHtml,
	toMarkdown,
} from "./mod.ts";
import type { Node, PostparseRule, PreparseRule, StagedRule } from "./types.ts";

/** Expands `{{name}}` from `vars`; `{{name}}` with no entry is left alone. */
function varsRule(vars: Record<string, string>): PreparseRule {
	return {
		id: "test:vars",
		stage: "preparse",
		trigger: "{",
		validate: (ctx) => {
			const tag = ctx.toNextSubstring("}}");
			return tag.startsWith("{{") && tag.slice(2, -2) in vars;
		},
		expand: (ctx) => {
			const tag = ctx.toNextSubstring("}}");
			ctx.cursor += tag.length - 1;
			return vars[tag.slice(2, -2)];
		},
	};
}

function withDefaults(...extra: StagedRule[]): StagedRule[] {
	return [...extra, ...defaultRules()];
}

Deno.test("preparse: substitutes source before lexing", () => {
	assertEquals(
		toHtml("Hello {{who}}!", withDefaults(varsRule({ who: "Sel" }))),
		"<p>Hello Sel!</p>",
	);
});

Deno.test("preparse: output is lexed as markup", () => {
	assertEquals(
		toHtml("{{title}}\n\nbody", withDefaults(varsRule({ title: "# Heading **bold**" }))),
		"<h1>Heading <strong>bold</strong></h1><p>body</p>",
	);
});

Deno.test("preparse: output lexes together with surrounding text", () => {
	const rows = "| Sel | rogue |\n| Vex | rogue |";
	const html = toHtml(
		"| Name | Class |\n|------|-------|\n{{rows}}",
		withDefaults(varsRule({ rows })),
	);
	assertEquals((html.match(/<tr>/g) ?? []).length, 3);
	assertEquals(/>Vex<\/td>/.test(html), true);
});

Deno.test("preparse: output is not rescanned", () => {
	const rules = [varsRule({ a: "{{b}}", b: "nope" })];
	assertEquals(preparse("x {{a}} y", rules), "x {{b}} y");
});

Deno.test("preparse: untriggered and declined text passes through", () => {
	const rules = [varsRule({ a: "1" })];
	assertEquals(preparse("{ {{z}} {{a}}", rules), "{ {{z}} 1");
	assertEquals(preparse("no rules here", []), "no rules here");
});

Deno.test("preparse: lineStart and currentLine track across expansions", () => {
	const seen: string[] = [];
	const rule: PreparseRule = {
		id: "test:line",
		stage: "preparse",
		trigger: "@",
		validate: () => true,
		expand: (ctx) => {
			seen.push(`${ctx.lineStart}:${ctx.currentLine}`);
			return "";
		},
	};
	preparse("a @\nbb @\n@", [rule]);
	assertEquals(seen, ["0:a @", "4:bb @", "9:@"]);
});

Deno.test("preparse: higher priority is offered the trigger first", () => {
	const low: PreparseRule = {
		id: "test:low",
		stage: "preparse",
		trigger: "%",
		validate: () => true,
		expand: () => "low",
	};
	const high: PreparseRule = { ...low, id: "test:high", priority: 1, expand: () => "high" };
	assertEquals(preparse("%", [low, high]), "high");
});

const upperText: PostparseRule<{ value: string }> = {
	id: "test:upper",
	stage: "postparse",
	visit: "core:text",
	transform: (node) => {
		node.data.value = node.data.value.toUpperCase();
	},
};

Deno.test("postparse: mutates in place", () => {
	assertEquals(toHtml("a *b*", withDefaults(upperText)), "<p>A <em>B</em></p>");
});

Deno.test("postparse: replaces and removes nodes", () => {
	const unwrapItalic: PostparseRule = {
		id: "test:unwrap",
		stage: "postparse",
		visit: "md:italic",
		transform: (node) => node.children,
	};
	const dropBold: PostparseRule = {
		id: "test:drop",
		stage: "postparse",
		visit: "md:bold",
		transform: () => null,
	};
	const rules = withDefaults(unwrapItalic, dropBold);
	assertEquals(toHtml("a *b* **c** d", rules), "<p>a b  d</p>");

	const tree = parse("*b*", rules);
	const paragraph = tree.children[0];
	assertEquals(paragraph.children[0].parent, paragraph);
});

Deno.test("postparse: children are visited before parents, replacements are not revisited", () => {
	const order: string[] = [];
	const rule: PostparseRule = {
		id: "test:order",
		stage: "postparse",
		transform: (node) => {
			order.push(node.tag);
			if (node.tag === "md:bold") {
				return { tag: "md:bold", data: {}, children: [] };
			}
		},
	};
	postparse(parse("**x**"), [rule]);
	assertEquals(order, ["core:text", "md:bold", "core:paragraph"]);
});

Deno.test("postparse: rules run in array order", () => {
	const wrap = (id: `test:${string}`, mark: string): PostparseRule<{ value: string }> => ({
		id,
		stage: "postparse",
		visit: "core:text",
		transform: (node) => {
			node.data.value += mark;
		},
	});
	const tree = postparse(parse("x"), [wrap("test:a", "1"), wrap("test:b", "2")]);
	assertEquals((tree.children[0].children[0] as Node<{ value: string }>).data.value, "x12");
});

Deno.test("splitStages sorts by stage, defaulting to parse", () => {
	const pre = varsRule({});
	const split = splitStages([pre, upperText, ...defaultRules()]);
	assertEquals(split.preparse, [pre]);
	assertEquals(split.postparse.length, 1);
	assertEquals(split.parse.length, defaultRules().length);
});

Deno.test("toMarkdown accepts the same staged array", () => {
	const rules = withDefaults(varsRule({ who: "Sel" }), upperText);
	assertEquals(toMarkdown(parse("hi *{{who}}*", rules), rules).trim(), "HI *SEL*");
});
