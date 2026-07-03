import { assert } from "@std/assert";
import { argset, fn } from "@fn";

Deno.test("Fn", () => {
	const f = fn((a: number, b: number) => a + b);
	assert(f(1, 2) === 3);
});
Deno.test("Fn.prototype.follow", () => {
	const f = fn((a: number, b: number) => a + b).follow((n) => n * 2);
	assert(f(1, 2) === 6);
});
Deno.test("Fn.prototype.pipe", () => {
	const f = fn((a: number, b: number) => argset(a + b)).pipe((n) => n * 2);
	assert(f(1, 2) === 6);
});
Deno.test("Fn.prototype.lead", () => {
	const f = fn((a: number, b: number) => a + b).lead((n) => [n, n]);
	assert(f(1) === 2);
});
