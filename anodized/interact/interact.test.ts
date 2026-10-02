import { assert, assertEquals } from "@std/assert";
import { type InputState, type PointerClick, PointerInput } from "./input.ts";
import { contains, HandleManager } from "./handles.ts";
import type { HandleResult, Handles } from "../types.ts";
import { Camera } from "../core/camera.ts";

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
	assertEquals(clicks, [{ button: 0, x: 11, y: 12 }]);
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
	assertEquals(clicks, [{ button: 2, x: 5, y: 5 }]);
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
		wheel: 0,
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
