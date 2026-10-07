import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { Signal } from "@bearmetal/app/signals";
import { compute, computeValues, evaluate, unwrapSignal, values } from "./mod.ts";

const state = <T>(value: T) => new Signal.State(value);

function world() {
	const backstory = state("Born in the Ashen Reach.");
	const motto = state("Quietly.");
	const selName = state("Sel");
	const vexName = state("Vex");
	const vexBackstory = state("Unknown.");
	const characters = state([
		{
			name: selName,
			properties: state([
				{ key: "backstory", value: backstory },
				{ key: "motto", value: motto },
			]),
		},
		{
			name: vexName,
			properties: state([{ key: "backstory", value: vexBackstory }]),
		},
	]);
	return { root: { characters }, characters, backstory, motto, selName, vexName, vexBackstory };
}

const QUERY = "characters{name:Sel}.properties{key:backstory}.value";

Deno.test("unwrapSignal reads through State, Computed and nesting", () => {
	const inner = state(1);
	assertEquals(unwrapSignal(inner), 1);
	assertEquals(unwrapSignal(new Signal.Computed(() => inner.get() + 1)), 2);
	assertEquals(unwrapSignal(state(state("deep"))), "deep");
	assertEquals(unwrapSignal(null), null);
	const plain = { get: () => "not a signal" };
	assertStrictEquals(unwrapSignal(plain), plain);
});

Deno.test("evaluate reads through signals by default", () => {
	const { root } = world();
	assertEquals(values(root, QUERY), ["Born in the Ashen Reach."]);
});

Deno.test("locations keep the signal a value came out of", () => {
	const { root, backstory } = world();
	const [location] = evaluate(root, QUERY);
	assertStrictEquals(location.cell, backstory);
	assertEquals(location.key, "value");

	const [plain] = evaluate({ a: { b: 1 } }, "a.b");
	assertEquals("cell" in plain, false);
});

Deno.test("an identity unwrap treats signals as opaque", () => {
	const { root, characters } = world();
	assertEquals(values(root, "characters", { unwrap: (v) => v }), [characters]);
});

Deno.test("compute tracks exactly the signals the query read", () => {
	const w = world();
	const result = compute(w.root, QUERY);
	result.get();
	const sources = new Set(Signal.subtle.introspectSources(result));

	assert(sources.has(w.characters));
	assert(sources.has(w.selName));
	assert(sources.has(w.vexName), "the filter has to test every name");
	assert(sources.has(w.backstory));
	assert(!sources.has(w.motto), "motto's value is never read");
	assert(!sources.has(w.vexBackstory), "Vex is filtered out before .properties");
});

Deno.test("compute updates when a read signal changes", () => {
	const w = world();
	const result = computeValues(w.root, QUERY);
	assertEquals(result.get(), ["Born in the Ashen Reach."]);

	w.backstory.set("Raised by wolves.");
	assertEquals(result.get(), ["Raised by wolves."]);

	w.vexName.set("Sel");
	assertEquals(result.get(), ["Raised by wolves.", "Unknown."]);

	w.selName.set("Selene");
	assertEquals(result.get(), ["Unknown."]);
});

Deno.test("compute does not report a change when the result is the same", () => {
	const w = world();
	const result = compute(w.root, QUERY);
	const first = result.get();

	w.motto.set("Loudly.");
	assertStrictEquals(result.get(), first, "an unread signal changed");

	w.vexName.set("Vexxa");
	assertStrictEquals(result.get(), first, "a read signal changed but the result did not");

	let runs = 0;
	const dependent = new Signal.Computed(() => {
		runs++;
		return result.get().length;
	});
	dependent.get();
	w.vexName.set("Vex");
	dependent.get();
	assertEquals(runs, 1);
});

Deno.test("compute tracks signal variables", () => {
	const w = world();
	const who = state("Sel");
	const result = computeValues(w.root, "characters{name:$who}.properties{key:backstory}.value", {
		vars: { who },
	});
	assertEquals(result.get(), ["Born in the Ashen Reach."]);
	who.set("Vex");
	assertEquals(result.get(), ["Unknown."]);
	who.set(["Sel", "Vex"] as unknown as string);
	assertEquals(result.get(), ["Born in the Ashen Reach.", "Unknown."]);
});

Deno.test("compute tracks replacing a whole array", () => {
	const w = world();
	const names = computeValues(w.root, "characters.name");
	assertEquals(names.get(), ["Sel", "Vex"]);
	w.characters.set([{ name: state("Orrin"), properties: state([]) }]);
	assertEquals(names.get(), ["Orrin"]);
});

Deno.test("a root signal is read through", () => {
	const root = state({ a: [1, 2] });
	const result = computeValues(root, "a");
	assertEquals(result.get(), [1, 2]);
	root.set({ a: [3] });
	assertEquals(result.get(), [3]);
});

Deno.test("compute parses eagerly", () => {
	let threw = false;
	try {
		compute({}, "a{");
	} catch {
		threw = true;
	}
	assert(threw);
});
