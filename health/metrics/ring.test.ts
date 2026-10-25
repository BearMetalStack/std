import { assertEquals, assertThrows } from "@std/assert";
import { BucketRing, quantile, SampleRing } from "./ring.ts";

function clock(start = 0) {
	let now = start;
	return { now: () => now, set: (t: number) => (now = t), advance: (ms: number) => (now += ms) };
}

Deno.test("BucketRing sums into buckets and fills gaps with zero", () => {
	const c = clock(10_000);
	const ring = new BucketRing(1000, 4, c.now);
	ring.add();
	ring.add(2);
	c.advance(2000);
	ring.add(5);
	assertEquals(ring.points(), [[9000, 0], [10_000, 3], [11_000, 0], [12_000, 5]]);
	assertEquals(ring.lastComplete(), [11_000, 0]);
	assertEquals(ring.completedTotal(), 3);
});

Deno.test("BucketRing drops buckets that roll out of the window", () => {
	const c = clock(0);
	const ring = new BucketRing(1000, 3, c.now);
	ring.add(7);
	c.advance(3000); // same slot as t=0, three buckets later
	ring.add(1);
	assertEquals(ring.points(), [[1000, 0], [2000, 0], [3000, 1]]);
	assertEquals(ring.valueAt(0), 0);
});

Deno.test("BucketRing rejects a non-positive size", () => {
	assertThrows(() => new BucketRing(0, 3));
	assertThrows(() => new BucketRing(1000, 0));
});

Deno.test("SampleRing keeps the latest samples, oldest first", () => {
	const c = clock(0);
	const ring = new SampleRing(3, c.now);
	for (const v of [1, 2, 3, 4]) {
		ring.push(v);
		c.advance(10);
	}
	assertEquals(ring.within(Infinity).map((s) => s.value), [2, 3, 4]);
	assertEquals(ring.within(15).map((s) => s.value), [4]);
	assertEquals(ring.latest()?.value, 4);
});

Deno.test("quantile picks by nearest rank", () => {
	const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
	assertEquals(quantile(values, 0.5), 5);
	assertEquals(quantile(values, 0.95), 10);
	assertEquals(quantile(values, 0), 1);
	assertEquals(quantile([], 0.5), NaN);
});
