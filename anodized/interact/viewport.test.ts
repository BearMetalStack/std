import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { Camera } from "../core/camera.ts";
import type { InputState } from "./input.ts";
import { ViewportController } from "./viewport.ts";

function input(over: Partial<InputState> = {}): InputState {
	return {
		x: 50,
		y: 50,
		dx: 0,
		dy: 0,
		inside: true,
		down: false,
		pressed: false,
		released: false,
		buttons: 0,
		pressedButtons: 0,
		releasedButtons: 0,
		wheel: 0,
		wheelX: 0,
		wheelZoom: false,
		shift: false,
		ctrl: false,
		alt: false,
		meta: false,
		...over,
	};
}

function camera() {
	const cam = new Camera(100, 100, 1);
	cam.x = cam.y = 0;
	return cam;
}

Deno.test("panButtons chooses which buttons pan, and only primary respects objects", () => {
	const cam = camera();
	const vp = new ViewportController({ panButtons: 4 });
	vp.update(input({ pressedButtons: 1, buttons: 1, down: true, pressed: true }), cam, false);
	vp.update(input({ buttons: 1, down: true, dx: 10 }), cam, false);
	assertEquals(cam.x, 0);
	// Middle button pans even over an object.
	vp.update(input({ pressedButtons: 4, buttons: 4 }), cam, true);
	assert(vp.panning);
	vp.update(input({ buttons: 4, dx: 10, dy: 5 }), cam, true);
	assertEquals([cam.x, cam.y], [-10, -5]);
	vp.update(input({ releasedButtons: 4 }), cam, true);
	assert(!vp.panning);

	const primary = new ViewportController();
	primary.update(input({ pressedButtons: 1, buttons: 1, down: true, pressed: true }), cam, true);
	assert(!primary.panning);
	assertEquals(new ViewportController({ dragPan: false }).panButtons, 0);
});

Deno.test("zoom is clamped to minZoom and maxZoom", () => {
	const cam = camera();
	const vp = new ViewportController({ minZoom: 0.5, maxZoom: 2 });
	for (let i = 0; i < 20; i++) vp.update(input({ wheel: -500 }), cam, false);
	assertAlmostEquals(cam.scale, 2);
	for (let i = 0; i < 20; i++) vp.update(input({ wheel: 500 }), cam, false);
	assertAlmostEquals(cam.scale, 0.5);
	cam.setLogScale(5);
	vp.clamp(cam);
	assertAlmostEquals(cam.scale, 2);
});

Deno.test("wheel 'pan' scrolls, and ctrl/pinch still zooms", () => {
	const cam = camera();
	const vp = new ViewportController({ wheel: "pan" });
	vp.update(input({ wheel: 20, wheelX: -10 }), cam, false);
	assertEquals([cam.x, cam.y, cam.scale], [-10, 20, 1]);
	vp.update(input({ wheel: -100, wheelZoom: true }), cam, false);
	assert(cam.scale > 1);
});
