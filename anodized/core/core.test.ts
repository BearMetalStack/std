import { assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import { Camera } from "./camera.ts";
import { linearScale, niceTicks } from "./scale.ts";
import { parseColor } from "./color.ts";

Deno.test("camera round-trips at extreme zoom", () => {
	for (const ls of [-1000, -60, 0, 60, 1000]) {
		const c = new Camera(800, 600);
		c.x = 12345.678;
		c.y = -0.001;
		c.setLogScale(ls);
		const [sx, sy] = c.worldToScreen(c.x, c.y);
		assertEquals([sx, sy], [400, 300]);
		const [wx, wy] = c.screenToWorld(400, 300);
		assertEquals([wx, wy], [c.x, c.y]);
	}
});

Deno.test("zoomAt keeps the world point under the cursor", () => {
	const c = new Camera(800, 600);
	const before = c.screenToWorld(123, 456);
	for (let i = 0; i < 50; i++) c.zoomAt(123, 456, 2);
	const after = c.screenToWorld(123, 456);
	assertAlmostEquals(after[0], before[0], 1e-9);
	assertAlmostEquals(after[1], before[1], 1e-9);
	assertEquals(c.logScale, 50);
});

Deno.test("fit frames the bounds", () => {
	const c = new Camera(200, 100);
	c.fit({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, 0);
	assertEquals(c.scale, 0.1);
	assertEquals([c.x, c.y], [500, 500]);
});

Deno.test("niceTicks picks round steps", () => {
	assertEquals(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
	assertEquals(niceTicks(0.1, 0.95, 4), [0.2, 0.4, 0.6, 0.8]);
	assertEquals(niceTicks(-3, 7, 5), [-2, 0, 2, 4, 6]);
	const s = linearScale([0, 10], [100, 0]);
	assertEquals(s(5), 50);
	assertEquals(s.invert(25), 7.5);
});

Deno.test("parseColor understands the documented forms", () => {
	assertEquals(parseColor("#fff"), [1, 1, 1, 1]);
	assertEquals(parseColor("#00000080")[3], 128 / 255);
	assertEquals(parseColor("rgba(255, 0, 0, 0.5)"), [1, 0, 0, 0.5]);
	assertEquals(parseColor("rgb(0 255 0 / 25%)"), [0, 1, 0, 0.25]);
	assertEquals(parseColor("transparent"), [0, 0, 0, 0]);
	assertEquals(parseColor([0.5, 0.5, 0.5]), [0.5, 0.5, 0.5, 1]);
	assertThrows(() => parseColor("nope"));
});
