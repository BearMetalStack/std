import { assert, assertEquals } from "@std/assert";
import { type Anodized, createHeadless } from "../mod.ts";

const adapter = typeof navigator !== "undefined" && navigator.gpu
	? await navigator.gpu.requestAdapter()
	: null;
const device = await adapter?.requestDevice();
const ignore = !device;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withHeadless(fn: (a: Anodized) => Promise<void>) {
	const a = await createHeadless({ width: 8, height: 8, device });
	try {
		await fn(a);
	} finally {
		a.destroy();
	}
}

Deno.test(
	{ name: "an idle loop draws once and stops", ignore },
	() =>
		withHeadless(async (a) => {
			let frames = 0;
			const stop = a.loop(() => frames++);
			await sleep(150);
			stop();
			assertEquals(frames, 1);
		}),
);

Deno.test(
	{ name: "continuous mode keeps drawing until it is switched off", ignore },
	() =>
		withHeadless(async (a) => {
			let frames = 0;
			const dts: number[] = [];
			const stop = a.loop((f) => {
				frames++;
				dts.push(f.dt);
			}, { continuous: true });
			await sleep(150);
			assert(frames >= 4, `only ${frames} frames`);
			assertEquals(dts[0], 0);
			assert(dts.slice(1).every((d) => d > 0 && d <= 100));
			a.continuous = false;
			await sleep(50);
			const settled = frames;
			await sleep(100);
			assertEquals(frames, settled, "idle again");
			a.continuous = true;
			await sleep(100);
			assert(frames > settled, "switching it back on wakes the loop");
			stop();
		}),
);

Deno.test(
	{ name: "requestFrame drives an animation and lets the loop idle when it ends", ignore },
	() =>
		withHeadless(async (a) => {
			let frames = 0;
			const stop = a.loop((f) => {
				if (++frames < 5) f.requestFrame();
			});
			await sleep(250);
			stop();
			assertEquals(frames, 5);
		}),
);
