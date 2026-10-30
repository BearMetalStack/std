import { assertEquals } from "@std/assert";
import { parse, toHtml, traceRules } from "./mod.ts";
import { defaultRules } from "./rules/mod.ts";

Deno.test("traceRules records which rule claimed what", () => {
	const source = "## a [*b*](x)";
	const { rules, traces } = traceRules(defaultRules());
	parse(source, rules);
	assertEquals(
		traces.map((t) => `${t.rule} ${t.tags.join(",")} ${source.slice(t.start, t.end)}`),
		[
			"md:heading md:heading ## ",
			"md:emphasis-star md:italic *",
			"md:emphasis-star md:italic *",
			"md:link md:link [*b*](x)",
		],
	);
});

Deno.test("traced rules parse exactly like the originals", () => {
	const source = "| a | **b** |\n| - | - |\n\n- [ ] c\n\n> d";
	assertEquals(toHtml(source, traceRules(defaultRules()).rules), toHtml(source));
});
