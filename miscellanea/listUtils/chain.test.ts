import { assertEquals, assertThrows } from "@std/assert";
import { Chain } from "./chain.ts";

Deno.test("operators are lazy and stop pulling once satisfied", () => {
	let pulled = 0;
	const source = Chain.range(0, 1_000_000).select((n) => (pulled++, n));
	assertEquals(source.where((n) => n % 2 === 0).take(3).toArray(), [0, 2, 4]);
	assertEquals(pulled, 5);
});

Deno.test("a chain over an array can be consumed repeatedly", () => {
	const c = Chain.from([1, 2, 3]).select((n) => n * 2);
	assertEquals(c.toArray(), [2, 4, 6]);
	assertEquals(c.toArray(), [2, 4, 6]);
});

Deno.test("groupBy keeps first-seen order and yields chains with a key", () => {
	const groups = Chain.from(["apple", "avocado", "banana", "blueberry", "cherry"]).groupBy((w) =>
		w[0]
	);
	assertEquals(groups.select((g) => [g.key, g.toArray()]).toArray(), [
		["a", ["apple", "avocado"]],
		["b", ["banana", "blueberry"]],
		["c", ["cherry"]],
	]);
});

Deno.test("groups can be sorted after groupBy, and members sorted within", () => {
	const result = Chain.from([3, 1, 2, 5, 4, 6])
		.groupBy((n) => n % 2 === 0 ? "even" : "odd")
		.orderByDescending((g) => g.key)
		.select((g) => [g.key, g.orderBy((n) => n).toArray()]);
	assertEquals(result.toArray(), [["odd", [1, 3, 5]], ["even", [2, 4, 6]]]);
});

Deno.test("groupBy with an element selector", () => {
	const g = Chain.from([{ k: "x", v: 1 }, { k: "x", v: 2 }]).groupBy((r) => r.k, (r) => r.v);
	assertEquals(g.first().toArray(), [1, 2]);
	assertEquals(g.first().sum(), 3);
});

Deno.test("orderBy is stable and thenBy breaks ties", () => {
	const rows = [
		{ n: "a", g: 2 },
		{ n: "b", g: 1 },
		{ n: "c", g: 2 },
		{ n: "d", g: 1 },
	];
	assertEquals(Chain.from(rows).orderBy((r) => r.g).select((r) => r.n).toArray(), [
		"b",
		"d",
		"a",
		"c",
	]);
	assertEquals(
		Chain.from(rows).orderBy((r) => r.g).thenByDescending((r) => r.n).select((r) => r.n).toArray(),
		["d", "b", "c", "a"],
	);
});

Deno.test("orderBy computes each key once per item", () => {
	let calls = 0;
	Chain.from([5, 3, 4, 1, 2]).orderBy((n) => (calls++, n)).toArray();
	assertEquals(calls, 5);
});

Deno.test("terminal operators", () => {
	const c = Chain.from([4, 8, 15, 16, 23, 42]);
	assertEquals(c.sum(), 108);
	assertEquals(c.average(), 18);
	assertEquals(c.min(), 4);
	assertEquals(c.max((n) => -n), 4);
	assertEquals(c.count((n) => n > 10), 4);
	assertEquals(c.first((n) => n > 10), 15);
	assertEquals(c.last(), 42);
	assertEquals(c.firstOrDefault((n) => n > 100, -1), -1);
	assertEquals(c.elementAt(2), 15);
	assertEquals(c.aggregate("", (a, n) => a + n % 10), "485632");
	assertThrows(() => c.single(), RangeError);
	assertEquals(c.single((n) => n === 8), 8);
	assertEquals(Chain.empty<number>().max(), undefined);
});

Deno.test("chunk, zip, distinct, concat, reverse", () => {
	assertEquals(Chain.range(1, 5).chunk(2).toArray(), [[1, 2], [3, 4], [5]]);
	assertEquals(Chain.from([1, 2]).zip(["a", "b", "c"]).toArray(), [[1, "a"], [2, "b"]]);
	assertEquals(Chain.from([1, 1, 2, 3, 3]).distinct().toArray(), [1, 2, 3]);
	assertEquals(Chain.from([1]).concat([2], [3]).reverse().toArray(), [3, 2, 1]);
});

Deno.test("fromAsync drains promises and async iterables", async () => {
	async function* gen() {
		yield 2;
		yield 3;
	}
	const c = await Chain.fromAsync(Promise.resolve([1]), gen());
	assertEquals(c.toArray(), [1, 2, 3]);
});
