import { assertEquals, assertThrows } from "@std/assert";
import { BmqlSyntaxError, parse, parseAt } from "./parser.ts";

Deno.test("parse: bare and dotted keys", () => {
	const query = parse("characters.properties.value");
	assertEquals(query.relative, false);
	assertEquals(query.steps.map((step) => step.kind === "key" && step.key), [
		"characters",
		"properties",
		"value",
	]);
});

Deno.test("parse: quoted keys", () => {
	const query = parse(`."odd key".'it\\'s'`);
	assertEquals(query.steps.map((step) => step.kind === "key" && step.key), ["odd key", "it's"]);
});

Deno.test("parse: relative query", () => {
	const query = parse("$.name");
	assertEquals(query.relative, true);
	assertEquals(query.steps.length, 1);
	assertEquals(parse("$").steps, []);
});

Deno.test("parse: empty query is the root", () => {
	assertEquals(parse("").steps, []);
});

Deno.test("parse: filter predicates", () => {
	const query = parse(
		`characters{name:Sel, lvl:>3, lvl:>=4, lvl:<9, lvl:<=8, name:!Vex, name:!=Vex, name:~se, backstory, !spouse, stats.str:10, who:$who, title:"Sel, the Bold"}`,
	);
	const filter = query.steps[1];
	if (filter.kind !== "filter") throw new Error("expected a filter");
	assertEquals(filter.predicates, [
		{ kind: "compare", field: ["name"], op: "=", value: { kind: "literal", value: "Sel" } },
		{ kind: "compare", field: ["lvl"], op: ">", value: { kind: "literal", value: "3" } },
		{ kind: "compare", field: ["lvl"], op: ">=", value: { kind: "literal", value: "4" } },
		{ kind: "compare", field: ["lvl"], op: "<", value: { kind: "literal", value: "9" } },
		{ kind: "compare", field: ["lvl"], op: "<=", value: { kind: "literal", value: "8" } },
		{ kind: "compare", field: ["name"], op: "!=", value: { kind: "literal", value: "Vex" } },
		{ kind: "compare", field: ["name"], op: "!=", value: { kind: "literal", value: "Vex" } },
		{ kind: "compare", field: ["name"], op: "~", value: { kind: "literal", value: "se" } },
		{ kind: "presence", field: ["backstory"], negate: false },
		{ kind: "presence", field: ["spouse"], negate: true },
		{ kind: "compare", field: ["stats", "str"], op: "=", value: { kind: "literal", value: "10" } },
		{ kind: "compare", field: ["who"], op: "=", value: { kind: "var", name: "who" } },
		{
			kind: "compare",
			field: ["title"],
			op: "=",
			value: { kind: "literal", value: "Sel, the Bold" },
		},
	]);
});

Deno.test("parse: bare values may contain spaces", () => {
	const filter = parse("a{name: Sel Vara }").steps[1];
	if (filter.kind !== "filter" || filter.predicates[0].kind !== "compare") throw new Error();
	assertEquals(filter.predicates[0].value, { kind: "literal", value: "Sel Vara" });
});

Deno.test("parse: slices", () => {
	const steps = parse("a[0][-1][1..3][2..][..-1]").steps.slice(1);
	assertEquals(steps.map((step) => step.kind === "slice" && [step.start, step.end, step.index]), [
		[0, undefined, true],
		[-1, undefined, true],
		[1, 3, false],
		[2, undefined, false],
		[undefined, -1, false],
	]);
});

Deno.test("parse: memoizes by source", () => {
	assertEquals(parse("a.b") === parse("a.b"), true);
});

Deno.test("parse: errors carry the offset", () => {
	const cases: [string, number][] = [
		["a.", 2],
		["a{}", 1],
		["a{name:", 7],
		["a{name:Sel", 1],
		["a[x]", 2],
		['a."open', 2],
		["a b", 2],
		["a{x y}", 4],
	];
	for (const [source, offset] of cases) {
		const error = assertThrows(() => parse(source), BmqlSyntaxError);
		assertEquals(error.offset, offset, source);
	}
});

Deno.test("parseAt: stops at the first character that cannot continue", () => {
	const source = "| $.name | $.class{x:1}[0] |";
	const first = parseAt(source, 2);
	assertEquals(first.query.source, "$.name");
	assertEquals(first.end, 8);
	const second = parseAt(source, 11);
	assertEquals(second.query.source, "$.class{x:1}[0]");
});
