import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { hitLine, type LineRegion } from "./linehit.ts";
import { HandleManager } from "./handles.ts";
import { Camera } from "../core/camera.ts";
import { Frame } from "../core/frame.ts";
import { Path } from "../geometry/path.ts";
import { curvePath } from "../solvers/curves.ts";
import type { Point } from "../types.ts";

function region(path: Path, extra: Partial<LineRegion> = {}): LineRegion {
	return {
		target: { id: "l", kind: "line" },
		path,
		strokeWidth: 2,
		scaleWidth: false,
		perInterval: 1,
		z: 0,
		...extra,
	};
}

Deno.test("a line is hit within half its width plus slop, with position along it", () => {
	const cam = new Camera(200, 200);
	const r = region(new Path().moveTo(0, 0).lineTo(100, 0));
	const h = hitLine(r, cam, 30, 4)!;
	assertEquals(h.point, [30, 0]);
	assertEquals(h.segment, 0);
	assertEquals(h.along, 30);
	assertAlmostEquals(h.fraction, 0.3);
	assertEquals(hitLine(r, cam, 30, 6), null);
});

Deno.test("slop is in screen pixels, along stays in world units", () => {
	const cam = new Camera(200, 200);
	cam.zoomAt(0, 0, 4);
	const r = region(new Path().moveTo(0, 10).lineTo(40, 10));
	const [sx, sy] = cam.worldToScreen(20, 10.5);
	const h = hitLine(r, cam, sx, sy)!;
	assertAlmostEquals(h.along, 20, 1e-9);
	assertAlmostEquals(h.point[1], 10, 1e-9);
	const [fx, fy] = cam.worldToScreen(20, 12);
	assertEquals(hitLine(r, cam, fx, fy), null, "2 world units is 8px at 4x zoom");
});

Deno.test("polyline and step-series segments map to point intervals", () => {
	const cam = new Camera(400, 400);
	const pts: Point[] = [[0, 0], [100, 0], [100, 100], [200, 100]];
	assertEquals(hitLine(region(new Path().poly(pts)), cam, 101, 50)?.segment, 1);
	const steps = region(curvePath(pts, "stepAfter"), { perInterval: 2 });
	assertEquals(hitLine(steps, cam, 150, 99)?.segment, 2);
	assertEquals(hitLine(steps, cam, 50, 1)?.segment, 0);
});

Deno.test("curves are hit along their actual shape", () => {
	const cam = new Camera(400, 400);
	const pts: Point[] = [[0, 100], [100, 0], [200, 100]];
	const r = region(curvePath(pts, "monotone"));
	assertAlmostEquals(hitLine(r, cam, 100, 1)!.fraction, 0.5, 0.02);
	// t = 0.2 on the second cubic.
	assertEquals(hitLine(r, cam, 120, 5.6)?.segment, 1);
	assertEquals(hitLine(r, cam, 100, 50), null, "the chord's midpoint is far from the curve");
});

Deno.test("a label plate counts as the line", () => {
	const cam = new Camera(400, 400);
	const r = region(new Path().moveTo(0, 50).lineTo(200, 50), {
		label: { x: 80, y: 40, w: 40, h: 20 },
	});
	const h = hitLine(r, cam, 85, 42)!;
	assertEquals(h.point, [100, 50]);
	assertEquals(h.distance, 0);
});

function frameWith(draw: (f: Frame) => void) {
	const camera = new Camera(600, 400);
	const handles = new HandleManager();
	handles.begin(null, camera);
	const f = new Frame({ camera, handles, routeCache: new Map(), background: "#fff" });
	draw(f);
	f.finish();
	handles.end();
	return handles;
}

Deno.test("connections are clickable without an id and sit under nodes", () => {
	const h = frameWith((f) => {
		f.node({ id: "a", x: 0, y: 0, w: 100, h: 50 });
		f.node({ id: "b", x: 300, y: 0, w: 100, h: 50 });
		f.connect("a", "b", { data: 7 });
	});
	const hit = h.hitTestLine(200, 25)!;
	assertEquals(hit.region.target.id, "a->b");
	assertEquals(hit.region.target.from, "a");
	assertEquals(hit.region.target.to, "b");
	assertEquals(hit.region.target.data, 7);
	assert(hit.z > h.shapeZ(200, 25), "nothing else is under the middle of the edge");
	const nearPort = h.hitTestLine(98, 25)!;
	assert(nearPort.z < h.shapeZ(98, 25), "the node wins where the edge meets it");
});

Deno.test("lines need an id; later lines win over earlier shapes", () => {
	const h = frameWith((f) => {
		f.rect({ id: "bg", x: 0, y: 0, w: 200, h: 200 });
		f.line(0, 100, 200, 100);
		f.polyline([[0, 50], [200, 50]], { id: "plot", data: "story" });
	});
	assertEquals(h.hitTestLine(100, 100), undefined);
	const hit = h.hitTestLine(100, 51)!;
	assertEquals(hit.region.target.kind, "polyline");
	assertEquals(hit.region.target.data, "story");
	assert(hit.z > h.shapeZ(100, 51));
});

Deno.test("series register their line with point-interval segments", () => {
	const h = frameWith((f) => {
		f.series([[0, 100], [100, 50], [200, 80]], { id: "s", curve: "linear" });
	});
	const hit = h.hitTestLine(150, 65)!;
	assertEquals(hit.region.target.kind, "series");
	assertEquals(hit.segment, 1);
});
