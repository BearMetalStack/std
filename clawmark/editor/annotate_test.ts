import { assert, assertEquals } from "@std/assert";
import { defaultRules } from "../rules/mod.ts";
import { collectMeta, editorRules, isWysiwygRule, withEditor } from "./annotate.ts";

Deno.test("editorRules attaches metadata by rule id and leaves the rest alone", () => {
	const rules = editorRules(defaultRules());
	assertEquals(rules.length, defaultRules().length);
	const byId = new Map(rules.map((r) => [r.id, r]));
	assert(isWysiwygRule(byId.get("md:bold")!));
	assert(!isWysiwygRule(byId.get("md:table")!));
	assert(!isWysiwygRule(byId.get("md:image")!));
});

Deno.test("collectMeta expands heading into six block entries and sorts", () => {
	const { blocks, inlines } = collectMeta(editorRules(defaultRules()));
	assertEquals(blocks.filter((b) => /^h\d$/.test(b.key)).length, 6);
	assertEquals(blocks[0].key, "p");
	assertEquals(inlines.map((i) => i.key).slice(0, 3), ["bold", "italic", "underline"]);
	assertEquals(
		new Set([...blocks, ...inlines].map((m) => m.key)).size,
		blocks.length + inlines.length,
	);
});

Deno.test("overrides replace or hide a default entry", () => {
	const hidden = collectMeta(editorRules(defaultRules(), { "md:bold": [] }));
	assert(!hidden.inlines.some((i) => i.key === "bold"));
});

Deno.test("withEditor lets a custom rule opt in", () => {
	const [bold] = defaultRules().filter((r) => r.id === "md:bold");
	const custom = withEditor({ ...bold, id: "x:shout" }, {
		key: "shout",
		kind: "inline",
		label: "Shout",
		element: { tag: "b" },
		is: (el) => el.localName === "b",
	});
	assertEquals(collectMeta([custom]).inlines[0].key, "shout");
});
