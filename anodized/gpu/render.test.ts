import { assert, assertEquals } from "@std/assert";
import { type Anodized, createHeadless, Path } from "../mod.ts";
import type { Snapshot } from "../types.ts";

const adapter = typeof navigator !== "undefined" && navigator.gpu
	? await navigator.gpu.requestAdapter()
	: null;
const device = await adapter?.requestDevice();
const ignore = !device;

function px(img: Snapshot, x: number, y: number): number[] {
	const i = (y * img.width + x) * 4;
	return [...img.pixels.subarray(i, i + 4)];
}

async function withHeadless(w: number, h: number, fn: (a: Anodized) => Promise<void>) {
	const a = await createHeadless({ width: w, height: h, background: "#ffffff", device });
	try {
		await fn(a);
	} finally {
		a.destroy();
	}
}

Deno.test(
	{ name: "a filled rect lands on exact pixels", ignore },
	() =>
		withHeadless(32, 32, async (a) => {
			a.frame((f) => f.rect({ x: 8, y: 8, w: 16, h: 16, fill: "#ff0000" }));
			const img = await a.read();
			assertEquals(px(img, 16, 16), [255, 0, 0, 255]);
			assertEquals(px(img, 9, 9), [255, 0, 0, 255]);
			assertEquals(px(img, 4, 4), [255, 255, 255, 255]);
			assertEquals(px(img, 25, 16), [255, 255, 255, 255]);
		}),
);

Deno.test(
	{ name: "evenodd leaves a hole where nonzero fills", ignore },
	() =>
		withHeadless(40, 40, async (a) => {
			const rings = new Path().rect(5, 5, 30, 30).rect(15, 15, 10, 10);
			a.frame((f) => f.path(rings, { fill: "#000000", fillRule: "evenodd" }));
			let img = await a.read();
			assertEquals(px(img, 8, 20), [0, 0, 0, 255]);
			assertEquals(px(img, 20, 20), [255, 255, 255, 255]);
			a.frame((f) => f.path(rings, { fill: "#000000", fillRule: "nonzero" }));
			img = await a.read();
			assertEquals(px(img, 20, 20), [0, 0, 0, 255]);
		}),
);

Deno.test(
	{ name: "a translucent self-crossing stroke blends once", ignore },
	() =>
		withHeadless(64, 64, async (a) => {
			a.frame((f) =>
				f.polyline([[4, 32], [60, 32], [60, 40], [32, 40], [32, 4]], {
					stroke: "rgba(0,0,0,0.5)",
					strokeWidth: 6,
				})
			);
			const img = await a.read();
			const crossing = px(img, 32, 32);
			const single = px(img, 16, 32);
			assertEquals(crossing, single);
			assert(Math.abs(single[0] - 128) <= 1, `expected ~50% grey, got ${single}`);
		}),
);

Deno.test(
	{ name: "shapes stay put on screen at extreme zoom", ignore },
	() =>
		withHeadless(32, 32, async (a) => {
			for (const ls of [-60, 60]) {
				const s = 2 ** ls;
				a.camera.setLogScale(ls);
				// Offsets of 2^-60 are only representable near zero: the float64 precision of the
				// caller's own coordinates is the real (and documented) limit.
				const c = ls < 0 ? 1e5 : 0;
				a.camera.x = c;
				a.camera.y = -c;
				a.frame((f) => f.circle({ x: c + 6 / s, y: -c - 6 / s, r: 4 / s, fill: "#0000ff" }));
				const img = await a.read();
				assertEquals(px(img, 22, 10), [0, 0, 255, 255], `logScale ${ls}`);
				assertEquals(px(img, 16, 16), [255, 255, 255, 255], `logScale ${ls}`);
			}
		}),
);

Deno.test(
	{ name: "a huge circle stays exact when zoomed onto its edge", ignore },
	() =>
		withHeadless(32, 32, async (a) => {
			a.camera.setLogScale(40);
			a.camera.x = 1;
			a.camera.y = 0;
			a.frame((f) => f.circle({ x: 0, y: 0, r: 1, fill: "#00ff00" }));
			const img = await a.read();
			assertEquals(px(img, 8, 16), [0, 255, 0, 255]);
			assertEquals(px(img, 24, 16), [255, 255, 255, 255]);
		}),
);

Deno.test(
	{ name: "tiled snapshots match a single-pass render", ignore },
	() =>
		withHeadless(8, 8, async (a) => {
			const draw = (f: Parameters<Parameters<Anodized["snapshot"]>[0]>[0]) => {
				for (let i = 0; i < 10; i++) {
					f.circle({ x: i * 30, y: (i % 3) * 25, r: 12, fill: `rgb(${i * 25}, 80, 200)` });
				}
				f.line(0, 0, 270, 50, { stroke: "#000", strokeWidth: 3 });
			};
			const whole = await a.snapshot(draw, { background: "#fff" });
			const tiled = await a.snapshot(draw, { background: "#fff", tileSize: 64 });
			assertEquals([tiled.width, tiled.height], [whole.width, whole.height]);
			let diff = 0;
			for (let i = 0; i < whole.pixels.length; i++) {
				diff = Math.max(diff, Math.abs(whole.pixels[i] - tiled.pixels[i]));
			}
			assert(diff <= 2, `tiles differ by up to ${diff}`);
		}),
);

Deno.test(
	{ name: "hitTest reports what the last frame drew, headless", ignore },
	() =>
		withHeadless(200, 200, async (a) => {
			a.camera.zoomAt(0, 0, 2);
			a.frame((f) => {
				f.rect({ x: 0, y: 0, w: 100, h: 100, fill: "#eee" });
				f.node({ id: "n", x: 10, y: 10, w: 40, h: 20, label: "N", data: "payload" });
			});
			const hit = a.hitTest(40, 30);
			assertEquals(hit.hit, true);
			assertEquals(hit.target?.id, "n");
			assertEquals(hit.target?.kind, "node");
			assertEquals(hit.target?.data, "payload");
			assertEquals([hit.x, hit.y], [20, 15]);
			const miss = a.hitTest(150, 150);
			assertEquals(miss.hit, false);
			assertEquals(miss.target, undefined);
			await Promise.resolve();
		}),
);

Deno.test(
	{ name: "hitTestLine reports where on the line, headless", ignore },
	() =>
		withHeadless(300, 200, async (a) => {
			a.frame((f) => {
				f.polyline([[20, 100], [220, 100]], { id: "plot", strokeWidth: 3, data: { arc: 1 } });
			});
			const hit = a.hitTestLine(70, 102);
			assertEquals(hit.hit, true);
			assertEquals(hit.target?.id, "plot");
			assertEquals(hit.point, { x: 70, y: 100 });
			assertEquals(hit.along, 50);
			assertEquals(hit.fraction, 0.25);
			assertEquals(a.hitTestLine(70, 130).hit, false);
			await Promise.resolve();
		}),
);

Deno.test(
	{ name: "dot grids render live and fill a snapshot", ignore },
	() =>
		withHeadless(40, 40, async (a) => {
			a.frame((f) => f.dotGrid({ size: 4, spacing: 20, color: "#000000" }));
			const live = await a.read();
			assertEquals(px(live, 20, 20), [0, 0, 0, 255]);
			assertEquals(px(live, 10, 10), [255, 255, 255, 255]);
			const snap = await a.snapshot((f) => {
				f.dotGrid({ size: 2, spacing: 10, color: "#000000" });
				f.rect({ x: 0, y: 0, w: 40, h: 40, stroke: "#ff0000" });
			}, { padding: 10, background: "#fff" });
			assertEquals(px(snap, 1, 1), [0, 0, 0, 255], "dots reach into the padding");
		}),
);
