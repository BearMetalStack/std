import { assert, assertEquals } from "@std/assert";
import { Camera } from "./camera.ts";
import { Frame } from "./frame.ts";
import { type DrawCommand, isImageFill } from "./commands.ts";
import { tessellate } from "./tessellate.ts";
import { VERTEX_FLOATS } from "../gpu/backend.ts";
import { fitImage } from "../image/source.ts";
import type { RawImage, Rect } from "../types.ts";

const img = (width: number, height: number): RawImage => ({
	width,
	height,
	pixels: new Uint8Array(width * height * 4),
});

function record(draw: (f: Frame) => void): DrawCommand[] {
	const f = new Frame({
		camera: new Camera(400, 400),
		handles: null,
		routeCache: new Map(),
		background: "#fff",
	});
	draw(f);
	return f.finish();
}

const rectOf = (c: DrawCommand): Rect | null =>
	isImageFill(c.style.fill) ? c.style.fill.rect : null;

Deno.test("fitImage follows object-fit", () => {
	const box = { x: 0, y: 0, w: 100, h: 50 };
	assertEquals(fitImage(20, 20, box, "fill", [0.5, 0.5]), box);
	assertEquals(fitImage(20, 20, box, "contain", [0.5, 0.5]), { x: 25, y: 0, w: 50, h: 50 });
	assertEquals(fitImage(20, 20, box, "cover", [0.5, 0.5]), { x: 0, y: -25, w: 100, h: 100 });
	assertEquals(fitImage(20, 20, box, "contain", [0, 1]), { x: 0, y: 0, w: 50, h: 50 });
	assertEquals(fitImage(20, 20, box, "none", [0.5, 0.5]), { x: 40, y: 15, w: 20, h: 20 });
});

Deno.test("image() sizes from the image and keeps the aspect ratio", () => {
	const [natural, byW, byH] = record((f) => {
		f.image(img(40, 20), { x: 0, y: 0 });
		f.image(img(40, 20), { x: 0, y: 0, w: 100 });
		f.image(img(40, 20), { x: 0, y: 0, h: 10 });
	});
	assertEquals(rectOf(natural), { x: 0, y: 0, w: 40, h: 20 });
	assertEquals(rectOf(byW), { x: 0, y: 0, w: 100, h: 50 });
	assertEquals(rectOf(byH), { x: 0, y: 0, w: 20, h: 10 });
});

Deno.test("an image fill covers the shape's bounds by default; boxes follow local space", () => {
	const [circle, boxed] = record((f) => {
		f.circle({ x: 50, y: 50, r: 10, fill: { image: img(10, 20) } });
		f.local(100, 0, (f) => {
			f.rect({
				x: 0,
				y: 0,
				w: 10,
				h: 10,
				fill: { image: img(1, 1), box: { x: 0, y: 0, w: 5, h: 5 } },
			});
		});
	});
	assertEquals(rectOf(circle), { x: 40, y: 30, w: 20, h: 40 });
	assertEquals(rectOf(boxed), { x: 100, y: 0, w: 5, h: 5 });
});

Deno.test("images that cannot show draw no fill", () => {
	const cmds = record((f) => {
		f.rect({ x: 0, y: 0, w: 10, h: 10, fill: { image: img(0, 0) } });
		f.rect({ x: 0, y: 0, w: 10, h: 10, fill: { image: img(4, 4) }, opacity: 0 });
	});
	assertEquals(cmds.map((c) => c.style.fill), [null, null]);
});

Deno.test("contain clips the fill to the image and maps its corners to 0..1", () => {
	const picture = img(10, 10);
	const cmds = record((f) => {
		f.rect({ x: 0, y: 0, w: 200, h: 100, fill: { image: picture, fit: "contain" } });
	});
	const g = tessellate(cmds, new Camera(400, 400).transform());
	assertEquals(g.items.length, 1);
	assertEquals(g.items[0].image, { source: picture, smoothing: "linear" });
	const xs: number[] = [], us: number[] = [];
	for (let i = 0; i < g.vertexCount; i++) {
		xs.push(g.vertices[i * VERTEX_FLOATS]);
		us.push(g.vertices[i * VERTEX_FLOATS + 6]);
	}
	assertEquals([Math.min(...xs), Math.max(...xs)], [50, 150]);
	assertEquals([Math.min(...us), Math.max(...us)], [0, 1]);
	assert(g.vertices[5] === 1, "the color is white at full opacity, premultiplied");
});

Deno.test("convex draws with different images are not merged", () => {
	const a = img(2, 2), b = img(2, 2);
	const cmds = record((f) => {
		f.rect({ x: 0, y: 0, w: 10, h: 10, fill: { image: a } });
		f.rect({ x: 20, y: 0, w: 10, h: 10, fill: { image: a } });
		f.rect({ x: 40, y: 0, w: 10, h: 10, fill: { image: b } });
		f.rect({ x: 60, y: 0, w: 10, h: 10, fill: "#f00" });
	});
	const g = tessellate(cmds, new Camera(400, 400).transform());
	assertEquals(g.items.map((i) => i.image?.source), [a, b, undefined]);
});
