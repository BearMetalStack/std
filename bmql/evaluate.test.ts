import { assertEquals } from "@std/assert";
import { evaluate, values } from "./evaluate.ts";

const entries = {
	characters: [
		{
			name: "Sel",
			class: "rogue",
			level: 5,
			properties: [
				{ key: "backstory", value: "Born in the Ashen Reach." },
				{ key: "motto", value: "Quietly." },
			],
		},
		{
			name: "Vex",
			class: "rogue",
			level: "3",
			spouse: null,
			properties: [{ key: "backstory", value: "Unknown." }],
		},
		{ name: "Orrin", class: "cleric", level: 7, stats: { str: 12 } },
	],
};

const mapped = {
	characters: {
		name: "Sel",
		properties: { backstory: "Born in the Ashen Reach." },
	},
};

Deno.test("the motivating query, array-of-entries shape", () => {
	assertEquals(values(entries, "characters{name:Sel}.properties{key:backstory}.value"), [
		"Born in the Ashen Reach.",
	]);
});

Deno.test("a lone object behaves like a one-member set", () => {
	assertEquals(values(mapped, "characters{name:Sel}.properties.backstory"), [
		"Born in the Ashen Reach.",
	]);
	assertEquals(values(mapped, "characters{name:Vex}.properties.backstory"), []);
});

Deno.test("key steps map over the set and flatten arrays", () => {
	assertEquals(values(entries, "characters.name"), ["Sel", "Vex", "Orrin"]);
	assertEquals(values(entries, "characters.properties.key"), ["backstory", "motto", "backstory"]);
});

Deno.test("missing keys and non-objects contribute nothing", () => {
	assertEquals(values(entries, "characters.stats.str"), [12]);
	assertEquals(values(entries, "characters.name.length"), []);
	assertEquals(values(entries, "nope.at.all"), []);
	assertEquals(values(null, "a"), []);
	assertEquals(values(entries, "characters.toString"), []);
});

Deno.test("an array root is a set of its elements", () => {
	assertEquals(values(entries.characters, "{class:cleric}.name"), ["Orrin"]);
});

Deno.test("slices index the set", () => {
	assertEquals(values(entries, "characters{class:rogue}[0].name"), ["Sel"]);
	assertEquals(values(entries, "characters[-1].name"), ["Orrin"]);
	assertEquals(values(entries, "characters[1..].name"), ["Vex", "Orrin"]);
	assertEquals(values(entries, "characters[..-1].name"), ["Sel", "Vex"]);
	assertEquals(values(entries, "characters[9].name"), []);
	assertEquals(values(entries, "characters[-9].name"), []);
});

Deno.test("equality is loose between primitives", () => {
	assertEquals(values(entries, "characters{level:3}.name"), ["Vex"]);
	assertEquals(values(entries, "characters{level:5}.name"), ["Sel"]);
	assertEquals(values({ a: [{ ok: true }, { ok: false }] }, "a{ok:true}.ok"), [true]);
	assertEquals(values({ a: [{ x: 0 }, { x: "" }] }, "a{x:0}.x"), [0]);
});

Deno.test("comparison operators", () => {
	assertEquals(values(entries, "characters{level:>4}.name"), ["Sel", "Orrin"]);
	assertEquals(values(entries, "characters{level:<=5}.name"), ["Sel", "Vex"]);
	assertEquals(values(entries, "characters{name:!Sel}.name"), ["Vex", "Orrin"]);
	assertEquals(values(entries, "characters{name:~E}.name"), ["Sel", "Vex"]);
	assertEquals(values(entries, "characters{name:>P}.name"), ["Sel", "Vex"]);
});

Deno.test("presence predicates; null counts as absent", () => {
	assertEquals(values(entries, "characters{properties}.name"), ["Sel", "Vex"]);
	assertEquals(values(entries, "characters{!properties}.name"), ["Orrin"]);
	assertEquals(values(entries, "characters{!spouse}.name"), ["Sel", "Vex", "Orrin"]);
});

Deno.test("filter fields can be paths and match if any value does", () => {
	assertEquals(values(entries, "characters{stats.str:>10}.name"), ["Orrin"]);
	assertEquals(values(entries, "characters{properties.key:motto}.name"), ["Sel"]);
	assertEquals(values(entries, "characters{properties.key:!motto}.name"), ["Vex", "Orrin"]);
});

Deno.test("predicates are ANDed", () => {
	assertEquals(values(entries, "characters{class:rogue, level:>4}.name"), ["Sel"]);
});

Deno.test("variables, including lists", () => {
	assertEquals(values(entries, "characters{name:$who}.level", { vars: { who: "Orrin" } }), [7]);
	assertEquals(
		values(entries, "characters{name:$who}.level", { vars: { who: ["Sel", "Orrin"] } }),
		[5, 7],
	);
	assertEquals(values(entries, "characters{name:$who}.level"), []);
});

Deno.test("relative queries start at self", () => {
	const self = entries.characters[1];
	assertEquals(values(entries, "$.name", { self }), ["Vex"]);
	assertEquals(values(entries, "$.characters[0].name"), ["Sel"]);
});

Deno.test("locations point back into the data", () => {
	const [location] = evaluate(entries, "characters{name:Sel}.properties{key:motto}.value");
	assertEquals(location.parent, entries.characters[0].properties?.[1]);
	assertEquals(location.key, "value");

	const [element] = evaluate(entries, "characters[1]");
	assertEquals(element.parent, entries.characters);
	assertEquals(element.key, 1);
});

Deno.test("Maps are read by key", () => {
	const data = { props: new Map([["backstory", "From a Map."]]) };
	assertEquals(values(data, "props.backstory"), ["From a Map."]);
});

Deno.test("unwrap is applied to every value read", () => {
	const box = <T>(value: T) => ({ boxed: value });
	const unwrap = (value: unknown) =>
		value !== null && typeof value === "object" && "boxed" in value ? value.boxed : value;
	const data = box({ characters: box([box({ name: box("Sel") })]) });
	assertEquals(values(data, "characters{name:Sel}.name", { unwrap }), ["Sel"]);
	assertEquals(
		values(data, "characters{name:$who}.name", { unwrap, vars: { who: box("Sel") } }),
		["Sel"],
	);
});
