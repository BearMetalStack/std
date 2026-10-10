import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { attachPose, pointInPolygon, samplePath } from "./attach.ts";
import { normalizePath } from "./path.ts";

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const sample = (d: string, m = identity, per = 16) => {
	const p = normalizePath(d);
	return samplePath(p.signature, p.values, m, per);
};

Deno.test("samplePath maps line points through the matrix", () => {
	const pts = sample("M 0,0 L 10,0 L 10,10 Z", { a: 2, b: 0, c: 0, d: 2, e: 1, f: 1 });
	assertEquals(pts, [{ x: 1, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 21 }]);
});

Deno.test("samplePath follows curves, quadratics included", () => {
	const q = sample("M 0,0 Q 5,10 10,0", identity, 2);
	assertAlmostEquals(q[1].x, 5, 1e-9);
	assertAlmostEquals(q[1].y, 5, 1e-9);
	const c = sample("M 0,0 C 0,10 10,10 10,0", identity, 2);
	assertAlmostEquals(c[1].y, 7.5, 1e-9);
});

Deno.test("pointInPolygon is even-odd", () => {
	const square = sample("M 0,0 L 10,0 L 10,10 L 0,10 Z");
	assert(pointInPolygon(square, { x: 5, y: 5 }));
	assert(!pointInPolygon(square, { x: 15, y: 5 }));
});

// An upper lid whose edge sits at `edgeY`, over a 20-wide, 40-tall eye centered on the origin.
const lid = (edgeY: number) => sample(`M -20,-30 L 20,-30 L 20,${edgeY} L -20,${edgeY} Z`);
const eye = ({ x, y }: { x: number; y: number }) => (x / 10) ** 2 + (y / 20) ** 2 <= 1;
const center = { x: 0, y: 0 };

Deno.test("an uncovered part stays where it was drawn", () => {
	assertEquals(attachPose(lid(-5), { x: -8, y: 0 }, center, eye), null);
});

Deno.test("a covered part rides the edge from the point that reached it", () => {
	const pose = attachPose(lid(5), { x: -8, y: 0 }, center, eye)!;
	assertAlmostEquals(pose.x, -8, 1e-9);
	assertAlmostEquals(pose.y, 5, 1e-9);
});

Deno.test("a part on the outer corner fans outward as the lid comes down", () => {
	// Left of center, so "out" is counterclockwise: a negative SVG angle.
	const left = attachPose(lid(8), { x: -6, y: -12 }, center, eye)!;
	assert(left.angle < 0, `left part turned ${left.angle}`);
	const right = attachPose(lid(8), { x: 6, y: -12 }, center, eye)!;
	assert(right.angle > 0, `right part turned ${right.angle}`);
	assertAlmostEquals(left.angle, -right.angle, 1e-9);
});

Deno.test("the turn starts from zero where the lid first reaches the root", () => {
	const pose = attachPose(lid(-11.99), { x: -6, y: -12 }, center, eye)!;
	assertAlmostEquals(pose.angle, 0, 0.1);
});
