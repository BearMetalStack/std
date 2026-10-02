import { assert, assertEquals } from "@std/assert";
import { type Anodized, createHeadless } from "../mod.ts";
import type { RawImage, Snapshot } from "../types.ts";

const adapter = typeof navigator !== "undefined" && navigator.gpu
	? await navigator.gpu.requestAdapter()
	: null;
const device = await adapter?.requestDevice();
const ignore = !device;

function px(img: Snapshot, x: number, y: number): number[] {
	const i = (y * img.width + x) * 4;
	return [...img.pixels.subarray(i, i + 4)];
}

function near(actual: number[], expected: number[], tol = 2): void {
	assert(
		actual.every((v, i) => Math.abs(v - expected[i]) <= tol),
		`${actual} is not within ${tol} of ${expected}`,
	);
}

async function withHeadless(w: number, h: number, fn: (a: Anodized) => Promise<void>) {
	const a = await createHeadless({ width: w, height: h, background: "#ffffff", device });
	try {
		await fn(a);
	} finally {
		a.destroy();
	}
}

/** Red, green / blue, translucent red. */
const quad: RawImage = {
	width: 2,
	height: 2,
	pixels: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 128]),
};

Deno.test(
	{ name: "image() paints texels where they belong, translucency over the background", ignore },
	() =>
		withHeadless(32, 32, async (a) => {
			a.frame((f) => f.image(quad, { x: 0, y: 0, w: 32, h: 32, smoothing: "nearest" }));
			const img = await a.read();
			assertEquals(px(img, 8, 8), [255, 0, 0, 255]);
			assertEquals(px(img, 24, 8), [0, 255, 0, 255]);
			assertEquals(px(img, 8, 24), [0, 0, 255, 255]);
			near(px(img, 24, 24), [255, 127, 127, 255]);
		}),
);

Deno.test(
	{ name: "an image fill is clipped by its shape, and contain leaves the rest empty", ignore },
	() =>
		withHeadless(64, 32, async (a) => {
			const red: RawImage = { width: 1, height: 1, pixels: new Uint8Array([255, 0, 0, 255]) };
			a.frame((f) => {
				f.circle({ x: 16, y: 16, r: 16, fill: { image: red } });
				f.rect({
					x: 32,
					y: 0,
					w: 32,
					h: 32,
					fill: {
						image: quad,
						fit: "contain",
						box: { x: 32, y: 0, w: 32, h: 16 },
						smoothing: "nearest",
					},
				});
			});
			const img = await a.read();
			assertEquals(px(img, 16, 16), [255, 0, 0, 255]);
			assertEquals(px(img, 1, 1), [255, 255, 255, 255], "outside the circle");
			assertEquals(px(img, 34, 8), [255, 255, 255, 255], "left of the contained image");
			assertEquals(px(img, 44, 4), [255, 0, 0, 255], "the image's top-left texel");
			assertEquals(px(img, 52, 12), [255, 127, 127, 255]);
			assertEquals(px(img, 48, 24), [255, 255, 255, 255], "below the box");
		}),
);

Deno.test(
	{ name: "opacity fades an image", ignore },
	() =>
		withHeadless(8, 8, async (a) => {
			const black: RawImage = { width: 1, height: 1, pixels: new Uint8Array([0, 0, 0, 255]) };
			a.frame((f) => f.image(black, { x: 0, y: 0, w: 8, h: 8, opacity: 0.5 }));
			near(px(await a.read(), 4, 4), [128, 128, 128, 255]);
		}),
);

Deno.test(
	{ name: "a large image drawn small is averaged through mipmaps, not aliased", ignore },
	() =>
		withHeadless(16, 16, async (a) => {
			const n = 128;
			const pixels = new Uint8Array(n * n * 4);
			for (let y = 0; y < n; y++) {
				for (let x = 0; x < n; x++) {
					const v = (x + y) % 2 ? 255 : 0;
					pixels.set([v, v, v, 255], (y * n + x) * 4);
				}
			}
			// 15px rather than 16 so samples miss texel boundaries, where plain bilinear would
			// average the checkerboard by coincidence.
			a.frame((f) => f.image({ width: n, height: n, pixels }, { x: 0, y: 0, w: 15, h: 15 }));
			const img = await a.read();
			for (let y = 1; y < 14; y += 3) {
				for (let x = 1; x < 14; x += 3) near(px(img, x, y), [128, 128, 128, 255], 12);
			}
		}),
);

Deno.test(
	{ name: "snapshots draw images, and invalidateImage picks up new pixels", ignore },
	() =>
		withHeadless(8, 8, async (a) => {
			const img: RawImage = { width: 1, height: 1, pixels: new Uint8Array([0, 0, 255, 255]) };
			const draw = (f: Parameters<Parameters<Anodized["frame"]>[0]>[0]) =>
				f.image(img, { x: 0, y: 0, w: 8, h: 8 });
			const snap = await a.snapshot(draw, { padding: 0 });
			assertEquals([snap.width, snap.height], [8, 8]);
			assertEquals(px(snap, 4, 4), [0, 0, 255, 255]);
			a.frame(draw);
			img.pixels.set([0, 255, 0, 255]);
			a.frame(draw);
			assertEquals(px(await a.read(), 4, 4), [0, 0, 255, 255], "cached until invalidated");
			a.invalidateImage(img);
			a.frame(draw);
			assertEquals(px(await a.read(), 4, 4), [0, 255, 0, 255]);
		}),
);
