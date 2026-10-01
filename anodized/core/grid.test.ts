import { assert, assertEquals } from "@std/assert";
import { dotGridPath, effectiveSpacing } from "./grid.ts";
import { expandGrids } from "./commands.ts";
import { Camera } from "./camera.ts";
import { Frame } from "./frame.ts";
import { Verb } from "../geometry/path.ts";

const view = { minX: 0, minY: 0, maxX: 100, maxY: 60 };
const dots = (p: { verbs: number[] }) => p.verbs.filter((v) => v === Verb.Move).length;

Deno.test("dots sit on the spacing lattice and cover the bounds", () => {
	const p = dotGridPath({ spacing: 20 }, view, 1);
	assertEquals(dots(p), 6 * 4);
	const b = p.bounds();
	assertEquals([b.minX, b.minY, b.maxX, b.maxY], [-1, -1, 101, 61]);
});

Deno.test("dot size is in screen pixels", () => {
	const p = dotGridPath({ size: 6, spacing: 20 }, view, 4);
	const b = p.bounds();
	assertEquals(b.minX, -0.75, "6px across at 4x zoom is a 0.75 world-unit radius");
});

Deno.test("the grid thins out when zoomed far out, staying on the lattice", () => {
	assertEquals(effectiveSpacing(20, 1, view), 20);
	assertEquals(effectiveSpacing(20, 0.1, view), 80);
	const huge = { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 };
	const s = effectiveSpacing(20, 1e-7, huge);
	assert(Number.isInteger(Math.log2(s / 20)));
	assert(dots(dotGridPath({ spacing: 20 }, huge, 1e-7)) <= 40_000);
});

Deno.test("dotGrid records a placeholder that expands to the given region", () => {
	const camera = new Camera(100, 60);
	const f = new Frame({ camera, handles: null, routeCache: new Map(), background: "#fff" });
	f.dotGrid({ spacing: 50, color: "#ff0000" });
	f.rect({ x: 0, y: 0, w: 10, h: 10, fill: "#000" });
	const cmds = f.finish();
	assert(cmds[0].grid);
	const [grid, rect] = expandGrids(cmds, view, 1);
	assertEquals(grid.grid, undefined);
	assertEquals(grid.style.fill, [1, 0, 0, 1]);
	assertEquals(dots(grid.path), 3 * 2);
	assertEquals(rect, cmds[1]);
});
