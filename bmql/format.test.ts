import { assertEquals, assertThrows } from "@std/assert";
import { Signal } from "@bearmetal/app/signals";
import { BmqlSyntaxError, computeText, format, hasTemplate, parsePipeline } from "./mod.ts";

const data = {
	characters: [
		{ name: "Sel", class: "rogue", level: 5, tags: ["quiet", "quick"] },
		{ name: "Vex", class: "rogue", level: 3, tags: [] },
		{ name: "Orrin", class: "cleric", level: 7, stats: { str: 12 } },
	],
};

Deno.test("parsePipeline: query only", () => {
	const pipeline = parsePipeline("  characters.name  ");
	assertEquals(pipeline.query.source, "characters.name");
	assertEquals(pipeline.stages, []);
});

Deno.test("parsePipeline: separator and template stages", () => {
	const pipeline = parsePipeline(`characters >> | $.name | $.class | >> "\\n"`);
	assertEquals(pipeline.stages.map((stage) => stage.kind), ["template", "separator"]);
	const [template, separator] = pipeline.stages;
	if (template.kind !== "template" || separator.kind !== "separator") throw new Error();
	assertEquals(
		template.parts.map((part) => typeof part === "string" ? part : `<${part.source}>`),
		["| ", "<$.name>", " | ", "<$.class>", " |"],
	);
	assertEquals(separator.value, "\n");
});

Deno.test("parsePipeline: a quoted string followed by more text is a template", () => {
	const [stage] = parsePipeline(`a >> "$.name" said`).stages;
	if (stage.kind !== "template") throw new Error("expected a template");
	assertEquals(stage.parts.map((part) => typeof part === "string" ? part : part.source), [
		'"',
		"$.name",
		'" said',
	]);
});

Deno.test("parsePipeline: escapes in templates", () => {
	const [stage] = parsePipeline(`a >> \\$5 \\>> \\\\ a\\nb`).stages;
	if (stage.kind !== "template") throw new Error();
	assertEquals(stage.parts, ["$5 >> \\ a\nb"]);
});

Deno.test("parsePipeline: a >> inside a template query's string does not split", () => {
	const pipeline = parsePipeline(`a >> $.x{y:">>"}.z!`);
	assertEquals(pipeline.stages.length, 1);
});

Deno.test("parsePipeline: errors", () => {
	assertEquals(assertThrows(() => parsePipeline("a b"), BmqlSyntaxError).offset, 2);
	assertEquals(assertThrows(() => parsePipeline("a > b"), BmqlSyntaxError).offset, 2);
	assertThrows(() => parsePipeline(`a >> "open`), BmqlSyntaxError);
});

Deno.test("format: many values join with a comma by default", () => {
	assertEquals(format(data, "characters{class:rogue}.name"), "Sel, Vex");
	assertEquals(format(data, "characters{class:rogue}[0].name"), "Sel");
	assertEquals(format(data, "characters{class:bard}.name"), "");
});

Deno.test("format: block position joins with a newline", () => {
	assertEquals(format(data, "characters.name", { block: true }), "Sel\nVex\nOrrin");
});

Deno.test("format: a separator stage overrides the default", () => {
	assertEquals(format(data, `characters.name >> " / "`), "Sel / Vex / Orrin");
	assertEquals(format(data, `characters.name >> "\\n"`, { block: false }), "Sel\nVex\nOrrin");
	assertEquals(format(data, `characters.name >> ", " >> ""`), "SelVexOrrin");
});

Deno.test("format: templates map each item", () => {
	assertEquals(
		format(data, "characters{class:rogue} >> | $.name | $.class |", { block: true }),
		"| Sel | rogue |\n| Vex | rogue |",
	);
	assertEquals(format(data, "characters >> $.name ($.level)"), "Sel (5), Vex (3), Orrin (7)");
});

Deno.test("format: a multi-valued template query joins with a comma", () => {
	assertEquals(
		format(data, `characters{class:rogue} >> $.name: $.tags >> "; "`),
		"Sel: quiet, quick; Vex: ",
	);
});

Deno.test("format: templates chain; $ is the previous stage's text", () => {
	assertEquals(format(data, "characters[0] >> $.name >> <$>"), "<Sel>");
});

Deno.test("format: a bare $ is the item itself", () => {
	assertEquals(format(data, "characters.name >> [$]"), "[Sel], [Vex], [Orrin]");
	const warnings: string[] = [];
	assertEquals(format(data, "characters[0] >> <$>", { onWarn: (m) => warnings.push(m) }), "<>");
	assertEquals(warnings.length, 1);
});

Deno.test("format: null is left out silently, objects with a warning", () => {
	const warnings: string[] = [];
	const onWarn = (message: string) => warnings.push(message);
	assertEquals(format({ a: [1, null, 2] }, "a", { onWarn }), "1, 2");
	assertEquals(warnings, []);
	assertEquals(format(data, "characters[2].stats", { onWarn }), "");
	assertEquals(warnings.length, 1);
	assertEquals(warnings[0].includes("characters[2].stats"), true);
});

Deno.test("format: vars reach template queries", () => {
	assertEquals(
		format(data, "characters{name:$who} >> $.name is $.class", { vars: { who: "Orrin" } }),
		"Orrin is cleric",
	);
});

Deno.test("hasTemplate", () => {
	assertEquals(hasTemplate("a.b"), false);
	assertEquals(hasTemplate(`a.b >> "\\n"`), false);
	assertEquals(hasTemplate("a >> $.b"), true);
});

Deno.test("computeText follows signals through templates", () => {
	const name = new Signal.State("Sel");
	const characters = new Signal.State([{ name, class: "rogue" }]);
	const text = computeText({ characters }, "characters >> | $.name | $.class |", { block: true });
	assertEquals(text.get(), "| Sel | rogue |");
	name.set("Selene");
	assertEquals(text.get(), "| Selene | rogue |");
	characters.set([...characters.get(), { name: new Signal.State("Vex"), class: "rogue" }]);
	assertEquals(text.get(), "| Selene | rogue |\n| Vex | rogue |");
});
