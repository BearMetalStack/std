import { assertEquals, assertNotStrictEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { Signal } from "@bearmetal/app/signals";
import { evaluate } from "./evaluate.ts";
import { WriteBatch } from "./write.ts";

function only(root: unknown, query: string) {
	const [location] = evaluate(root, query);
	return location;
}

Deno.test("plain data is written in place", () => {
	const row = { name: "Sel", level: 5 };
	const data = { characters: [row] };
	const batch = new WriteBatch();
	batch.set(only(data, "characters{name:Sel}.level"), 6);
	batch.commit();
	assertStrictEquals(data.characters[0], row);
	assertEquals(row.level, 6);
});

Deno.test("a write under a signal copies up to it and sets it", () => {
	const sel = { name: "Sel", stats: { str: 10 } };
	const vex = { name: "Vex", stats: { str: 8 } };
	const rows = new Signal.State([sel, vex]);
	const before = rows.get();

	const batch = new WriteBatch();
	batch.set(only({ rows }, "rows{name:Sel}.stats.str"), 12);
	batch.commit();

	const after = rows.get();
	assertNotStrictEquals(after, before);
	assertNotStrictEquals(after[0], sel);
	assertNotStrictEquals(after[0].stats, sel.stats);
	assertStrictEquals(after[1], vex, "untouched rows keep their identity");
	assertEquals(after[0], { name: "Sel", stats: { str: 12 } });
	assertEquals(sel.stats.str, 10, "the original is not mutated");
});

Deno.test("a signal-held value is set on its signal", () => {
	const level = new Signal.State(5);
	const rows = new Signal.State([{ name: "Sel", level }]);
	const before = rows.get();
	const batch = new WriteBatch();
	batch.set(only({ rows }, "rows.level"), 6);
	assertEquals(level.get(), 6);
	assertStrictEquals(rows.get(), before, "nothing above the signal is copied");
});

Deno.test("several writes under one array share one copy", () => {
	const rows = new Signal.State([{ n: 1 }, { n: 2 }, { n: 3 }]);
	const batch = new WriteBatch();
	for (const location of evaluate({ rows }, "rows.n")) {
		batch.set(location, (location.value as number) * 10);
	}
	batch.commit();
	assertEquals(rows.get(), [{ n: 10 }, { n: 20 }, { n: 30 }]);
});

Deno.test("removals apply highest index first", () => {
	const rows = new Signal.State(["a", "b", "c", "d"]);
	const batch = new WriteBatch();
	for (const location of evaluate({ rows }, "rows[0..3]")) {
		if (location.value !== "c") batch.remove(location);
	}
	batch.commit();
	assertEquals(rows.get(), ["c", "d"]);
});

Deno.test("removal from objects and Maps", () => {
	const data = new Signal.State({ a: 1, b: 2, m: new Map([["x", 1], ["y", 2]]) });
	const batch = new WriteBatch();
	batch.remove(only({ data }, "data.a"));
	batch.remove(only({ data }, "data.m.x"));
	batch.commit();
	assertEquals(data.get().b, 2);
	assertEquals("a" in data.get(), false);
	assertEquals([...data.get().m.keys()], ["y"]);
});

Deno.test("rollback restores every signal the batch set", () => {
	const level = new Signal.State(5);
	const rows = new Signal.State([{ name: "Sel", level }, { name: "Vex" }]);
	const before = rows.get();
	const batch = new WriteBatch();
	batch.set(only({ rows }, "rows{name:Sel}.level"), 9);
	batch.set(only({ rows }, "rows{name:Vex}.name"), "Vexxa");
	batch.rollback();
	assertEquals(level.get(), 5);
	assertStrictEquals(rows.get(), before);
});

Deno.test("computeds and the root are not writable", () => {
	const doubled = new Signal.Computed(() => [{ n: 2 }]);
	assertThrows(
		() => new WriteBatch().set(only({ doubled }, "doubled.n"), 3),
		Error,
		"Signal.State",
	);
	assertThrows(() => new WriteBatch().set(only({ a: 1 }, ""), 3), Error, "root");
});
