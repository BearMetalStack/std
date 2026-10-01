import { assertEquals } from "@std/assert";
import { toHtml } from "./mod.ts";
import { defaultRules } from "./rules/mod.ts";
import type { AnyRule } from "./types.ts";

/** A `#[label]` element: the kind of rule the heading rule used to shadow. */
function labelRule(priority?: number): AnyRule {
	return {
		id: "x:label",
		trigger: "#",
		priority,
		validate: (ctx) => /^#\[[^\]]*\]/.test(ctx.currentLine.slice(ctx.cursor - ctx.lineStart)),
		tokenize(ctx) {
			const text = ctx.toNextSubstring("]");
			ctx.cursor += text.length - 1;
			return { tag: "x:label", data: { name: text.slice(2, -1) } };
		},
		tree(token, ctx) {
			ctx.currentNode.children.push({ tag: "x:label", data: token.data, children: [] });
		},
		renderOpen: (node) => `<label>${node.data.name}</label>`,
	} as AnyRule;
}

Deno.test("the heading rule declines #[ so a later rule can have it", () => {
	const rules = [...defaultRules(), labelRule()];
	assertEquals(toHtml("#[cast] list", rules).includes("<label>cast</label>"), true);
	assertEquals(toHtml("#[cast] list", rules).includes("<h1>"), false);
	assertEquals(toHtml("# Title", rules), "<h1>Title</h1>");
});

Deno.test("priority beats registration order among rules sharing a trigger", () => {
	const shadowing: AnyRule = {
		id: "x:greedy",
		trigger: "#",
		validate: (ctx) => ctx.cursor === ctx.lineStart,
		tokenize(ctx) {
			ctx.cursor += ctx.currentLine.length - 1;
			return { tag: "x:greedy", data: {} };
		},
		tree(token, ctx) {
			ctx.currentNode.children.push({ tag: "x:greedy", data: token.data, children: [] });
		},
		renderOpen: () => "<greedy/>",
	} as AnyRule;
	const base = defaultRules().filter((r) => r.id !== "md:heading");
	assertEquals(toHtml("#[cast]", [shadowing, ...base, labelRule()]).includes("<greedy/>"), true);
	assertEquals(
		toHtml("#[cast]", [shadowing, ...base, labelRule(1)]).includes("<label>cast</label>"),
		true,
	);
});
