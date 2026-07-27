import { assertAlmostEquals, assertEquals } from "@std/assert";
import { generateRelativeLightnessMap, STOPS } from "./mod.ts";

const BOUNDS = { min: 0.1, max: 0.98 };

Deno.test("generateRelativeLightnessMap reaches both extremes by default", () => {
	const map = generateRelativeLightnessMap(0.55, 500);
	assertAlmostEquals(map[50], BOUNDS.max);
	assertAlmostEquals(map[950], BOUNDS.min);
	assertAlmostEquals(map[500], 0.55);
});

Deno.test("generateRelativeLightnessMap reaches extremes from an off-center seed", () => {
	const map = generateRelativeLightnessMap(0.5, 200);
	assertAlmostEquals(map[50], BOUNDS.max);
	assertAlmostEquals(map[950], BOUNDS.min);
	assertAlmostEquals(map[200], 0.5);
});

Deno.test("generateRelativeLightnessMap is evenly spaced within each side", () => {
	const map = generateRelativeLightnessMap(0.5, 200);
	const lighterStep = map[50] - map[100];
	assertAlmostEquals(map[100] - map[200], lighterStep);
	const darkerStep = map[200] - map[300];
	for (let i = STOPS.indexOf(300); i < STOPS.length - 1; i++) {
		assertAlmostEquals(map[STOPS[i]] - map[STOPS[i + 1]], darkerStep);
	}
});

Deno.test("generateRelativeLightnessMap is monotonically decreasing", () => {
	const map = generateRelativeLightnessMap(0.65, 400);
	for (let i = 0; i < STOPS.length - 1; i++) {
		const lighter = map[STOPS[i]], darker = map[STOPS[i + 1]];
		if (lighter <= darker) {
			throw new Error(`stop ${STOPS[i]} (${lighter}) not lighter than ${STOPS[i + 1]} (${darker})`);
		}
	}
});

Deno.test("uniformStep shares one step size across both sides", () => {
	const map = generateRelativeLightnessMap(0.5, 200, STOPS, BOUNDS, true);
	const step = map[100] - map[200];
	for (let i = 0; i < STOPS.length - 1; i++) {
		assertAlmostEquals(map[STOPS[i]] - map[STOPS[i + 1]], step);
	}
	// The side with the smaller per-step size (darker: 0.4 over 8 steps)
	// sets the pace and lands on its bound...
	assertAlmostEquals(map[950], BOUNDS.min);
	// ...so the other side falls short of its extreme.
	assertEquals(map[50] < BOUNDS.max - 0.05, true);
});

Deno.test("seed at an end stop still ramps the other side to its extreme", () => {
	const map = generateRelativeLightnessMap(0.97, 50);
	assertAlmostEquals(map[50], 0.97);
	assertAlmostEquals(map[950], BOUNDS.min);
});
