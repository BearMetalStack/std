import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { monotoneTangents } from "./curves.ts";
import { curvePath } from "./curves.ts";
import { perimeterPoint } from "./anchors.ts";
import { countBends, solveRoute } from "./route.ts";
import { flattenPath } from "../geometry/flatten.ts";
import type { Point, Rect } from "../types.ts";

Deno.test("monotone curves never overshoot monotone data", () => {
	const pts: Point[] = [[0, 0], [1, 0.1], [2, 5], [3, 5.1], [4, 10], [5, 10]];
	const [poly] = flattenPath(curvePath(pts, "monotone"), {
		cx: 0,
		cy: 0,
		s: 100,
		ox: 0,
		oy: 0,
		width: 1e4,
		height: 1e4,
		pr: 1,
	}, null);
	for (let i = 3; i < poly.pts.length; i += 2) {
		assert(poly.pts[i] >= poly.pts[i - 2] - 1e-6, "y decreased on increasing data");
	}
	assertEquals(monotoneTangents([[0, 0], [1, 1], [2, 1]])[2], 0);
});

Deno.test("perimeter points lie on each shape", () => {
	const rect: Rect = { x: 0, y: 0, w: 100, h: 50 };
	assertEquals(perimeterPoint({ rect, shape: "rect", radius: 0 }, 200, 25), [100, 25]);
	const [ex, ey] = perimeterPoint({ rect, shape: "ellipse", radius: 0 }, 150, 75);
	assertAlmostEquals(((ex - 50) / 50) ** 2 + ((ey - 25) / 25) ** 2, 1, 1e-9);
	const [dx, dy] = perimeterPoint({ rect, shape: "diamond", radius: 0 }, 150, 75);
	assertAlmostEquals(Math.abs(dx - 50) / 50 + Math.abs(dy - 25) / 25, 1, 1e-9);
	const [rx, ry] = perimeterPoint({ rect, shape: "roundRect", radius: 20 }, 1050, 475);
	assertAlmostEquals(Math.hypot(rx - 80, ry - 30), 20, 1e-9);
});

Deno.test("orthogonal routes go around obstacles", () => {
	const a = { rect: { x: 0, y: 0, w: 50, h: 50 }, shape: "rect" as const, radius: 0 };
	const b = { rect: { x: 300, y: 0, w: 50, h: 50 }, shape: "rect" as const, radius: 0 };
	const wall: Rect = { x: 150, y: -100, w: 40, h: 250 };
	const route = solveRoute({
		from: a,
		to: b,
		kind: "orthogonal",
		margin: 10,
		obstacles: [a.rect, b.rect, wall],
	});
	const p = route.points;
	assertEquals(p[0], [50, 25]);
	assertEquals(p[p.length - 1], [300, 25]);
	for (let i = 1; i < p.length; i++) {
		const [x0, y0] = p[i - 1], [x1, y1] = p[i];
		assert(x0 === x1 || y0 === y1, "segment is not axis-aligned");
		const hitsWall = Math.max(x0, x1) > wall.x && Math.min(x0, x1) < wall.x + wall.w &&
			Math.max(y0, y1) > wall.y && Math.min(y0, y1) < wall.y + wall.h;
		assert(!hitsWall, `segment ${p[i - 1]} -> ${p[i]} crosses the wall`);
	}
	assertEquals(countBends(p), 4);
});

Deno.test("unobstructed orthogonal routes are straight", () => {
	const a = { rect: { x: 0, y: 0, w: 50, h: 50 }, shape: "rect" as const, radius: 0 };
	const b = { rect: { x: 200, y: 0, w: 50, h: 50 }, shape: "rect" as const, radius: 0 };
	const r = solveRoute({
		from: a,
		to: b,
		kind: "orthogonal",
		margin: 10,
		obstacles: [a.rect, b.rect],
	});
	assertEquals(r.points, [[50, 25], [200, 25]]);
});

Deno.test("Z-shaped routes put their jog halfway", () => {
	const a = { rect: { x: 0, y: 0, w: 50, h: 50 }, shape: "rect" as const, radius: 0 };
	const b = { rect: { x: 100, y: 200, w: 50, h: 50 }, shape: "rect" as const, radius: 0 };
	const r = solveRoute({
		from: a,
		to: b,
		kind: "orthogonal",
		margin: 10,
		obstacles: [a.rect, b.rect],
	});
	assertEquals(r.points, [[25, 50], [25, 125], [125, 125], [125, 200]]);
});

Deno.test("U-shaped routes keep their stubs outside both nodes", () => {
	const a = { rect: { x: 0, y: 0, w: 50, h: 50 }, shape: "rect" as const, radius: 0 };
	const b = { rect: { x: 100, y: 0, w: 50, h: 50 }, shape: "rect" as const, radius: 0 };
	const r = solveRoute({
		from: a,
		to: b,
		kind: "orthogonal",
		fromPort: "top",
		toPort: "top",
		margin: 10,
		obstacles: [a.rect, b.rect],
	});
	for (const [, y] of r.points.slice(1, -1)) assert(y <= -10 + 1e-9);
});
