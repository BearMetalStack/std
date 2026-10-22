import { assert, assertEquals } from "@std/assert";
import { type InputState, type PointerClick, PointerInput } from "./input.ts";
import { contains, HandleManager } from "./handles.ts";
import type { HandleResult, Handles } from "../types.ts";
import { Camera } from "../core/camera.ts";

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };

function fakeCanvas() {
	const el = new EventTarget() as EventTarget & Record<string, unknown>;
	el.getBoundingClientRect = () => ({ left: 0, top: 0 });
	el.setPointerCapture = () => {};
	const fire = (type: string, x: number, y: number, button = 0) =>
		el.dispatchEvent(
			Object.assign(new Event(type), { clientX: x, clientY: y, button, pointerId: 1 }),
		);
	return { el: el as unknown as HTMLElement, fire };
}

function listen() {
	const input = new PointerInput();
	const { el, fire } = fakeCanvas();
	const clicks: PointerClick[] = [];
	input.onClick = (c) => clicks.push(c);
	input.attach(el);
	return { input, fire, clicks };
}

Deno.test("a press and release in place is a click", () => {
	const { fire, clicks } = listen();
	fire("pointerdown", 10, 10);
	fire("pointerup", 11, 12);
	assertEquals(clicks, [{ button: 0, x: 11, y: 12, ...NO_MODS }]);
});

Deno.test("a drag is not a click, even if it comes back", () => {
	const { fire, clicks } = listen();
	fire("pointerdown", 10, 10);
	fire("pointermove", 40, 10);
	fire("pointermove", 10, 10);
	fire("pointerup", 10, 10);
	assertEquals(clicks, []);
});

Deno.test("other buttons click, and cancel clears presses", () => {
	const { fire, clicks } = listen();
	fire("pointerdown", 5, 5, 2);
	fire("pointerup", 5, 5, 2);
	fire("pointerdown", 5, 5, 1);
	fire("pointercancel", 5, 5, 1);
	fire("pointerup", 5, 5, 1);
	assertEquals(clicks, [{ button: 2, x: 5, y: 5, ...NO_MODS }]);
});

Deno.test("contains follows the outline", () => {
	const box = { x: 0, y: 0, w: 100, h: 50 };
	assert(contains({ ...box, shape: "rect" }, 1, 1));
	assert(!contains({ ...box, shape: "ellipse" }, 1, 1));
	assert(contains({ ...box, shape: "ellipse" }, 50, 25));
	assert(!contains({ ...box, shape: "diamond" }, 10, 5));
	assert(contains({ ...box, shape: "diamond" }, 50, 5));
});

Deno.test("hitTest returns the topmost target with its data", () => {
	const cam = new Camera(200, 200);
	const h = new HandleManager();
	h.begin(null, cam);
	h.interact("under", { x: 0, y: 0, w: 100, h: 100 }, false, { kind: "rect", shape: "rect" });
	h.interact("over", { x: 50, y: 50, w: 100, h: 100 }, false, {
		kind: "node",
		shape: "ellipse",
		label: "Hi",
		data: { n: 1 },
	});
	h.end();
	assertEquals(h.hitTest(100, 100)?.id, "over");
	assertEquals(h.hitTest(100, 100)?.data, { n: 1 });
	assertEquals(h.hitTest(55, 55)?.id, "under", "ellipse corner falls through to the rect");
	assertEquals(h.hitTest(190, 10), undefined);
});

Deno.test("hit targets carry their box in screen pixels at the current pan and zoom", () => {
	const cam = new Camera(200, 200);
	cam.zoomAt(0, 0, 2);
	cam.pan(10, 20);
	const h = new HandleManager();
	h.begin(null, cam);
	h.interact("r", { x: 10, y: 10, w: 30, h: 15 }, false, { kind: "rect", shape: "rect" });
	h.end();
	const t = h.hitTest(50, 50)!;
	assertEquals(t.screen, { x: 30, y: 40, w: 60, h: 30 });
	assertEquals([t.x, t.y, t.w, t.h], [10, 10, 30, 15], "world box is unchanged");
});

/** Hovers `from`, presses there, then moves to `to`; returns the last frame's result. */
function drag(handles: Handles, from: [number, number], to: [number, number]) {
	const cam = new Camera(400, 400);
	const h = new HandleManager();
	const rect = { x: 0, y: 0, w: 100, h: 100 };
	const meta = { kind: "rect", shape: "rect" } as const;
	const input = (x: number, y: number, pressed: boolean): InputState => ({
		x,
		y,
		dx: 0,
		dy: 0,
		inside: true,
		down: true,
		pressed,
		released: false,
		buttons: 1,
		pressedButtons: pressed ? 1 : 0,
		releasedButtons: 0,
		wheel: 0,
		wheelX: 0,
		wheelZoom: false,
		...NO_MODS,
	});
	const frames = [input(...from, false), input(...from, true), input(...to, false)];
	let result!: HandleResult, overlays = 0;
	for (const state of frames) {
		h.begin(state, cam);
		result = h.interact("r", rect, handles, meta);
		overlays = h.end().overlays.length;
	}
	return { ...result, overlays };
}

Deno.test(`handles: "move" drags the body and has no resize handles`, () => {
	const body = drag("move", [50, 50], [70, 60]);
	assertEquals([body.dragging, body.pos, body.size], [true, { x: 20, y: 10 }, { w: 100, h: 100 }]);
	assertEquals(body.overlays, 0);
	const corner = drag("move", [100, 100], [120, 130]);
	assertEquals([corner.resizing, corner.size], [false, { w: 100, h: 100 }]);
});

Deno.test(`handles: "resize" resizes from the handles and ignores body drags`, () => {
	const corner = drag("resize", [100, 100], [120, 130]);
	assertEquals([corner.resizing, corner.size], [true, { w: 120, h: 130 }]);
	assert(corner.overlays > 0);
	const body = drag("resize", [50, 50], [70, 60]);
	assertEquals([body.changed, body.dragging], [false, false]);
});

Deno.test("handles: true does both", () => {
	assertEquals(drag(true, [50, 50], [70, 60]).pos, { x: 20, y: 10 });
	assertEquals(drag(true, [100, 100], [120, 130]).size, { w: 120, h: 130 });
});

Deno.test("every button reports held, pressed and released bits", () => {
	const { input, fire } = listen();
	fire("pointerdown", 5, 5, 1);
	let s = input.consume();
	assertEquals([s.buttons, s.pressedButtons, s.releasedButtons], [4, 4, 0]);
	assertEquals([s.down, s.pressed], [false, false]);
	fire("pointerdown", 5, 5, 0);
	s = input.consume();
	assertEquals([s.buttons, s.pressedButtons, s.down, s.pressed], [5, 1, true, true]);
	fire("pointerup", 5, 5, 1);
	s = input.consume();
	assertEquals([s.buttons, s.releasedButtons, s.down], [1, 4, true]);
	fire("pointercancel", 5, 5, 0);
	s = input.consume();
	assertEquals([s.buttons, s.releasedButtons, s.released], [0, 1, true]);
});

Deno.test("modifiers ride along on input and clicks", () => {
	const input = new PointerInput();
	const { el } = fakeCanvas();
	const clicks: PointerClick[] = [];
	input.onClick = (c) => clicks.push(c);
	const detach = input.attach(el);
	const fire = (type: string, mods: Record<string, boolean>) =>
		el.dispatchEvent(
			Object.assign(new Event(type), { clientX: 1, clientY: 1, button: 0, pointerId: 1, ...mods }),
		);
	fire("pointerdown", { shiftKey: true });
	fire("pointerup", { shiftKey: true, metaKey: true });
	assertEquals(clicks, [{
		button: 0,
		x: 1,
		y: 1,
		shift: true,
		ctrl: false,
		alt: false,
		meta: true,
	}]);
	assertEquals(input.consume().shift, true);
	detach();
});

Deno.test("the wheel reports both axes and whether it was a zoom gesture", () => {
	const input = new PointerInput();
	const { el } = fakeCanvas();
	input.attach(el);
	const wheel = (deltaX: number, deltaY: number, ctrlKey = false) =>
		el.dispatchEvent(
			Object.assign(new Event("wheel"), {
				clientX: 0,
				clientY: 0,
				deltaX,
				deltaY,
				deltaMode: 0,
				ctrlKey,
			}),
		);
	wheel(3, 4);
	wheel(1, 1);
	let s = input.consume();
	assertEquals([s.wheelX, s.wheel, s.wheelZoom], [4, 5, false]);
	wheel(0, -2, true);
	s = input.consume();
	assertEquals([s.wheel, s.wheelZoom], [-2, true]);
	assertEquals(input.consume().wheel, 0);
});

Deno.test("contextMenu false suppresses the browser menu", () => {
	const input = new PointerInput();
	const { el } = fakeCanvas();
	input.attach(el);
	const menu = () => {
		const e = new Event("contextmenu", { cancelable: true });
		el.dispatchEvent(e);
		return e.defaultPrevented;
	};
	assertEquals(menu(), false);
	input.contextMenu = false;
	assertEquals(menu(), true);
});

Deno.test("hit tests during a frame see the last finished frame", () => {
	const h = new HandleManager();
	const cam = new Camera(100, 100, 1);
	cam.x = cam.y = 50;
	const meta = { kind: "rect", shape: "rect" } as const;
	h.begin(null, cam);
	h.interact("a", { x: 0, y: 0, w: 20, h: 20 }, undefined, meta);
	h.end();
	h.begin(null, cam);
	// Mid-recording, nothing of the new frame is registered yet, but "a" is still on screen.
	assertEquals(h.hitTest(10, 10)?.id, "a");
	h.interact("b", { x: 0, y: 0, w: 20, h: 20 }, undefined, meta);
	assertEquals(h.hitTest(10, 10)?.id, "a");
	h.end();
	assertEquals(h.hitTest(10, 10)?.id, "b");
});
