import { assertEquals, assertThrows } from "@std/assert";
import { Camera } from "./camera.ts";
import { Frame } from "./frame.ts";
import { HandleManager } from "../interact/handles.ts";
import { Path } from "../geometry/path.ts";

function frame(pointer: { x: number; y: number } | null = null) {
	const camera = new Camera(600, 400);
	const handles = new HandleManager();
	handles.begin(null, camera);
	const f = new Frame({ camera, handles, routeCache: new Map(), background: "#fff" }, pointer);
	return { f, handles };
}

const box = (b: { minX: number; minY: number; maxX: number; maxY: number }) => [
	b.minX,
	b.minY,
	b.maxX,
	b.maxY,
];

Deno.test("local offsets every draw call, and nested spaces add up", () => {
	const { f } = frame();
	f.local(100, 50, (f) => {
		f.rect({ x: 0, y: 0, w: 10, h: 10, fill: "#000" });
		f.local(5, 5, (f) => f.polygon([[0, 0], [10, 0], [0, 10]], { fill: "#000" }));
		f.series([[0, 0], [10, 10]], { curve: "linear" });
		f.path(new Path().moveTo(0, 0).lineTo(20, 0), { stroke: "#000" });
	});
	f.circle({ x: 0, y: 0, r: 1, fill: "#000" });
	const cmds = f.finish();
	assertEquals(box(cmds[0].bounds), [100, 50, 110, 60]);
	assertEquals(box(cmds[1].bounds), [105, 55, 115, 65]);
	assertEquals(box(cmds[2].bounds), [100, 50, 110, 60]);
	assertEquals(box(cmds[3].bounds), [100, 50, 120, 50]);
	assertEquals(box(cmds[4].bounds), [-1, -1, 1, 1]);
});

Deno.test("hit regions are placed in world space, results come back local", () => {
	const { f, handles } = frame();
	const r = f.local(200, 100, (f) => {
		f.line(0, 0, 50, 0, { id: "l" });
		return f.rect({ id: "r", x: 10, y: 20, w: 30, h: 30 });
	});
	f.finish();
	handles.end();
	assertEquals(r.pos, { x: 10, y: 20 });
	assertEquals(handles.hitTest(225, 135)?.id, "r");
	assertEquals(handles.hitTest(25, 35), undefined);
	assertEquals(handles.hitTestLine(225, 100)?.region.target.id, "l");
});

Deno.test("nodes in different local spaces connect by id", () => {
	const { f, handles } = frame();
	f.local(0, 0, (f) => f.node({ id: "a", x: 0, y: 0, w: 100, h: 50 }));
	f.local(300, 0, (f) => f.node({ id: "b", x: 0, y: 0, w: 100, h: 50 }));
	f.connect("a", "b");
	f.finish();
	handles.end();
	assertEquals(handles.hitTestLine(200, 25)?.region.target.id, "a->b");
});

Deno.test("pointer and origin follow the local space, and are restored after a throw", () => {
	const { f } = frame({ x: 30, y: 40 });
	f.local(10, 10, (f) => {
		assertEquals(f.origin, { x: 10, y: 10 });
		assertEquals(f.pointer, { x: 20, y: 30 });
	});
	assertThrows(() =>
		f.local(5, 5, () => {
			throw new Error("boom");
		})
	);
	assertEquals(f.origin, { x: 0, y: 0 });
	assertEquals(f.pointer, { x: 30, y: 40 });
});
