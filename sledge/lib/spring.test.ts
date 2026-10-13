import { assert, assertAlmostEquals } from "@std/assert";
import { AngularSpring } from "./spring.ts";
import { Motion } from "./motion.ts";

const run = (spring: AngularSpring, seconds: number, force: (t: number) => number) => {
	for (let t = 0; t < seconds; t += 1 / 60) spring.step(1 / 60, force(t));
	return spring.angle;
};

Deno.test("a pushed spring settles back to rest", () => {
	const spring = new AngularSpring(60, 8);
	run(spring, 0.2, () => 300);
	assert(Math.abs(spring.angle) > 1);
	run(spring, 5, () => 0);
	assertAlmostEquals(spring.angle, 0, 0.01);
});

Deno.test("a steady force holds the angle at gain·F/k", () => {
	const spring = new AngularSpring(50, 10, 2);
	assertAlmostEquals(run(spring, 10, () => 5), (2 * 5) / 50, 1e-3);
});

Deno.test("the angle never passes its limit", () => {
	const spring = new AngularSpring(1, 0, 1, 20);
	run(spring, 2, () => 1e6);
	assert(Math.abs(spring.angle) <= 20);
});

Deno.test("moving right swings a hanging part clockwise", () => {
	const motion = new Motion();
	const spring = new AngularSpring(40, 6);
	let x = 0;
	for (let i = 0; i < 30; i++) {
		x += 0.02;
		motion.update(1 / 60, [x, 0], [0, 0], [0, 0]);
		spring.step(1 / 60, motion.force(1));
	}
	assert(spring.angle > 0, `expected a clockwise swing, got ${spring.angle}`);
});
