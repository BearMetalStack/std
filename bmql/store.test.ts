import { assert, assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { Signal } from "@bearmetal/app/signals";
import { f, SchemaError } from "@bearmetal/forge";
import { computeText, computeValues } from "./mod.ts";
import { Store } from "./store.ts";

const characterSchema = f.object({ name: f.string(), class: f.string(), level: f.number() });

function party() {
	const store = new Store();
	const characters = store.table("characters", characterSchema);
	characters.insert(
		{ name: "Sel", class: "rogue", level: 5 },
		{ name: "Vex", class: "rogue", level: 3 },
		{ name: "Orrin", class: "cleric", level: 7 },
	);
	const notes = store.table("notes");
	notes.insert({ about: "Sel", text: "Owes Vex money", tags: ["debt"] });
	return { store, characters, notes };
}

Deno.test("tables are reachable from the store root", () => {
	const { store } = party();
	assertEquals(store.tables, ["characters", "notes"]);
	assertEquals(store.values("characters{class:rogue}.name"), ["Sel", "Vex"]);
	assertEquals(store.values("notes{about:Sel}.text"), ["Owes Vex money"]);
});

Deno.test("table queries start at its rows", () => {
	const { characters } = party();
	assertEquals(characters.values("{level:>4}.name"), ["Sel", "Orrin"]);
});

Deno.test("table() returns the existing table and refuses a second schema", () => {
	const { store, characters } = party();
	assertStrictEquals(store.table("characters"), characters);
	assertThrows(() => store.table("characters", characterSchema), Error, "already exists");
});

Deno.test("insert parses through the schema", () => {
	const { characters } = party();
	assertThrows(
		() => characters.insert({ name: "Bad", class: "bard", level: "high" as unknown as number }),
		SchemaError,
	);
	assertEquals(characters.rows.get().length, 3);
});

Deno.test("update writes every match, or a limit", () => {
	const { store } = party();
	assertEquals(store.update("characters{class:rogue}.level", 1), 2);
	assertEquals(store.values("characters.level"), [1, 1, 7]);
	assertEquals(store.update("characters.level", 9, { limit: 1 }), 1);
	assertEquals(store.values("characters.level"), [9, 1, 7]);
	assertEquals(store.update("characters{name:Nobody}.level", 1), 0);
});

Deno.test("update takes a function of the current value", () => {
	const { store } = party();
	store.update("characters.level", (level) => (level as number) + 1);
	assertEquals(store.values("characters.level"), [6, 4, 8]);
});

Deno.test("merge patches objects and skips everything else", () => {
	const { store, characters } = party();
	assertEquals(characters.merge("{name:Sel}", { level: 6 }), 1);
	assertEquals(characters.rows.get()[0], { name: "Sel", class: "rogue", level: 6 });
	assertEquals(store.merge("characters.name", { x: 1 }), 0);
});

Deno.test("delete removes rows and nested values", () => {
	const { store } = party();
	assertEquals(store.delete("characters{class:rogue}"), 2);
	assertEquals(store.values("characters.name"), ["Orrin"]);
	assertEquals(store.delete("notes.tags"), 1);
	assertEquals(store.values("notes.tags"), []);
});

Deno.test("a write that breaks the schema is rolled back", () => {
	const { store, characters } = party();
	const before = characters.rows.get();
	const error = assertThrows(
		() => store.update("characters{class:rogue}.level", "high"),
		SchemaError,
	);
	assert(error.message.includes("characters.0.level"), error.message);
	assertStrictEquals(characters.rows.get(), before);
});

Deno.test("unschema'd tables take anything", () => {
	const { store } = party();
	store.merge("notes{about:Sel}", { mood: { grim: true } });
	assertEquals(store.values("notes.mood.grim"), [true]);
});

Deno.test("store queries are reactive through the root", () => {
	const { store } = party();
	const rogues = computeValues(store.root, "characters{class:rogue}.name");
	assertEquals(rogues.get(), ["Sel", "Vex"]);

	store.merge("characters{name:Orrin}", { class: "rogue" });
	assertEquals(rogues.get(), ["Sel", "Vex", "Orrin"]);

	store.table("characters").insert({ name: "Wren", class: "rogue", level: 1 });
	assertEquals(rogues.get(), ["Sel", "Vex", "Orrin", "Wren"]);

	const later = computeText(store.root, "spells.name");
	assertEquals(later.get(), "");
	store.table("spells").insert({ name: "Mending" });
	assertEquals(later.get(), "Mending", "a table created later is picked up");
});

Deno.test("writes to an unrelated row do not wake an unaffected query", () => {
	const { store } = party();
	const sel = computeValues(store.root, "characters{name:Sel}.level");
	let runs = 0;
	const dependent = new Signal.Computed(() => {
		runs++;
		return sel.get();
	});
	dependent.get();
	store.update("characters{name:Orrin}.level", 8);
	dependent.get();
	assertEquals(runs, 1);
});
