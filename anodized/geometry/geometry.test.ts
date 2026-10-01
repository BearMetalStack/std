import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { Path } from "./path.ts";
import { flattenPath } from "./flatten.ts";
import { strokePolyline } from "./stroke.ts";
import { dashPolyline } from "./dash.ts";
import { clipPolygon, clipPolyline } from "./clip.ts";
import type { Transform } from "../core/camera.ts";

const identity: Transform = { cx: 0, cy: 0, s: 1, ox: 0, oy: 0, width: 1000, height: 1000, pr: 1 };

Deno.test("flatten keeps a circle within tolerance", () => {
	const [poly] = flattenPath(new Path().circle(0, 0, 100), identity, null, 0.25);
	assert(poly.closed);
	const p = poly.pts;
	for (let i = 0; i + 3 < p.length; i += 2) {
		// Four cubics approximate a circle to within ~0.027% of the radius.
		assertAlmostEquals(Math.hypot(p[i], p[i + 1]), 100, 0.03);
		const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2;
		assert(100 - Math.hypot(mx, my) <= 0.25 + 0.03);
	}
});

Deno.test("flatten replaces off-screen curves with their control polygon", () => {
	const t: Transform = { ...identity, s: 1e12, cx: 1e3, cy: 0, ox: 500, oy: 500 };
	const [poly] = flattenPath(new Path().circle(0, 0, 1e3), t, {
		minX: -10,
		minY: -10,
		maxX: 1010,
		maxY: 1010,
	});
	assert(poly.pts.length < 2000, `expected few points, got ${poly.pts.length / 2}`);
});

Deno.test("stroke: a butt-capped segment is one quad", () => {
	const out: number[] = [];
	strokePolyline(
		[0, 0, 10, 0],
		false,
		{ halfWidth: 1, join: "miter", cap: "butt", miterLimit: 4 },
		out,
	);
	assertEquals(out.length / 2, 6);
	const ys = out.filter((_, i) => i % 2 === 1);
	assertEquals(Math.min(...ys), -1);
	assertEquals(Math.max(...ys), 1);
});

Deno.test("stroke: sharp joins past the miter limit fall back to bevel", () => {
	const params = { halfWidth: 1, join: "miter" as const, cap: "butt" as const, miterLimit: 4 };
	const right: number[] = [];
	strokePolyline([0, 0, 10, 0, 10, 10], false, params, right);
	assertEquals(right.length / 2, 12 + 6);
	const sharp: number[] = [];
	strokePolyline([0, 0, 10, 0, 0, 0.5], false, params, sharp);
	assertEquals(sharp.length / 2, 12 + 3);
});

Deno.test("dash lengths follow the pattern", () => {
	const dashes = dashPolyline([0, 0, 100, 0], [10, 5], 0, null);
	assertEquals(dashes.length, 7);
	for (const d of dashes.slice(0, 6)) assertAlmostEquals(d[2] - d[0], 10, 1e-9);
	assertAlmostEquals(dashes[6][2] - dashes[6][0], 10, 1e-9);
	const shifted = dashPolyline([0, 0, 100, 0], [10, 5], 5, null);
	assertAlmostEquals(shifted[0][2] - shifted[0][0], 5, 1e-9);
});

Deno.test("dashes skip invisible stretches without emitting", () => {
	const dashes = dashPolyline([-1e9, 0, 100, 0], [10, 10], 0, {
		minX: 0,
		minY: -1,
		maxX: 100,
		maxY: 1,
	});
	assert(dashes.length <= 6);
	for (const d of dashes) assert(d[0] >= -1e-6 && d[d.length - 2] <= 100 + 1e-6);
});

Deno.test("clipping keeps output inside the box", () => {
	const b = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
	const poly = clipPolygon([-5, -5, 15, -5, 15, 15, -5, 15], b);
	for (let i = 0; i < poly.length; i++) assert(poly[i] >= 0 && poly[i] <= 10);
	const lines = clipPolyline([-5, 5, 5, 5, 5, 20, 8, 20, 8, 5], b);
	assertEquals(lines.length, 2);
});

Deno.test("arcTo rounds a right-angle corner tangentially", () => {
	const p = new Path().moveTo(0, 0).arcTo(10, 0, 10, 10, 4).lineTo(10, 10);
	const [poly] = flattenPath(p, identity, null, 0.01);
	const pts = poly.pts;
	for (let i = 0; i < pts.length; i += 2) {
		const x = pts[i], y = pts[i + 1];
		if (x > 6 && y < 4) assertAlmostEquals(Math.hypot(x - 6, y - 4), 4, 0.02);
	}
});
