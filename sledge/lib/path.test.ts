import { assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import { blend, compatible, normalizePath, serializePath, transformPath } from "./path.ts";

const close = (a: ArrayLike<number>, b: ArrayLike<number>) => {
	assertEquals(a.length, b.length);
	for (let i = 0; i < a.length; i++) assertAlmostEquals(a[i], b[i], 1e-9);
};

Deno.test("relative and absolute spellings of a shape normalize the same", () => {
	const abs = normalizePath("M 10,10 L 20,10 L 20,20 C 20,25 15,30 10,30 Z");
	const rel = normalizePath("m 10 10 h 10 v 10 c 0,5 -5,10 -10,10 z");
	assertEquals(rel.signature, abs.signature);
	close(rel.values, abs.values);
});

Deno.test("implicit repeats after M are line-tos", () => {
	const p = normalizePath("m 0,0 10,0 0,10");
	assertEquals(p.signature, "MLL");
	close(p.values, [0, 0, 10, 0, 10, 10]);
});

Deno.test("S and T expand to their reflected control points", () => {
	const s = normalizePath("M 0,0 C 0,10 10,10 10,0 S 20,-10 20,0");
	assertEquals(s.signature, "MCC");
	close(s.values.slice(8, 10), [10, -10]);

	const t = normalizePath("M 0,0 Q 5,10 10,0 T 20,0");
	assertEquals(t.signature, "MQQ");
	close(t.values.slice(6, 8), [15, -10]);
});

Deno.test("compact arc flags and exponents tokenize", () => {
	const p = normalizePath("M0 0a5 5 0 1010 0l1e1-.5.5.5");
	assertEquals(p.signature, "MALL");
	close(p.values, [0, 0, 5, 5, 0, 1, 0, 10, 0, 20, -0.5, 20.5, 0]);
});

Deno.test("malformed paths throw", () => {
	assertThrows(() => normalizePath("10,10 L 20,20"));
	assertThrows(() => normalizePath("M 10"));
});

Deno.test("shapes with different nodes are incompatible", () => {
	const a = normalizePath("M 0,0 L 10,0 L 10,10 Z");
	const b = normalizePath("M 0,0 L 10,0 L 10,10 L 0,10 Z");
	assertEquals(compatible(a, b), false);
	assertEquals(compatible(a, normalizePath("m 1,1 h 5 v 5 z")), true);
});

Deno.test("blending is additive from the base", () => {
	const base = normalizePath("M 0,0 L 10,0");
	const up = normalizePath("M 0,-10 L 10,0");
	const right = normalizePath("M 10,0 L 10,0");
	close(blend(base, [up, right], [0.5, 0]), [0, -5, 10, 0]);
	close(blend(base, [up, right], [1, 1]), [10, -10, 10, 0]);
	close(blend(base, [up, right], [0, 0]), [0, 0, 10, 0]);
});

Deno.test("arc flags snap to the heaviest target instead of interpolating", () => {
	const base = normalizePath("M 0,0 A 5 5 0 0 0 10,0");
	const flipped = normalizePath("M 0,0 A 5 5 0 1 1 10,0");
	assertEquals(blend(base, [flipped], [0.4])[5], 0);
	assertEquals(blend(base, [flipped], [0.6])[5], 1);
});

Deno.test("transformPath maps points and refuses arcs", () => {
	const p = normalizePath("M 1,2 L 3,4");
	const moved = transformPath(p, { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 })!;
	close(moved.values, [12, 24, 16, 28]);
	assertEquals(transformPath(p, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), p);
	assertEquals(
		transformPath(normalizePath("M 0,0 A 5 5 0 0 0 10,0"), { a: 1, b: 0, c: 0, d: 1, e: 1, f: 0 }),
		null,
	);
});

Deno.test("serialization round-trips", () => {
	const p = normalizePath("M 0,0 C 1,2 3,4 5,6 A 5 5 0 1 0 10,0 Z");
	const again = normalizePath(serializePath(p.signature, p.values));
	assertEquals(again.signature, p.signature);
	close(again.values, p.values);
});
