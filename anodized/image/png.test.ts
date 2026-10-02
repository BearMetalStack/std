import { assertEquals, assertRejects } from "@std/assert";
import { decodePng } from "./png.ts";
import { loadImage } from "./load.ts";
import { encodePng } from "../snapshot/png.ts";

// Fixtures cover every color type and bit depth, palettes and tRNS, Adam7 interlacing and all
// five filter types. They were written by ImageMagick and Pillow; each `.rgba` beside them is
// ImageMagick's own decode (`magick x.png -depth 8 RGBA:x.rgba`).
const dir = new URL("../testdata/png/", import.meta.url);
const fixtures = [...Deno.readDirSync(dir)]
	.map((e) => e.name)
	.filter((n) => n.endsWith(".png"))
	.sort();

for (const name of fixtures) {
	Deno.test(`decodes ${name} like ImageMagick does`, async () => {
		const img = await decodePng(await Deno.readFile(new URL(name, dir)));
		const expected = await Deno.readFile(new URL(name.replace(".png", ".rgba"), dir));
		assertEquals([img.width, img.height], [13, 9]);
		assertEquals(img.pixels, expected);
	});
}

Deno.test("round-trips through encodePng", async () => {
	const pixels = new Uint8Array(5 * 3 * 4).map((_, i) => (i * 37) % 256);
	const img = await decodePng(await encodePng(5, 3, pixels));
	assertEquals(img, { width: 5, height: 3, pixels });
});

Deno.test("rejects what it cannot read", async () => {
	await assertRejects(() => decodePng(new Uint8Array([1, 2, 3])), Error, "not a PNG");
	const png = await encodePng(4, 4, new Uint8Array(64));
	await assertRejects(() => decodePng(png.subarray(0, 40)), Error);
});

Deno.test("loadImage decodes PNG to raw pixels without a browser, and names what it cannot", async () => {
	const png = await encodePng(2, 1, new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]));
	const img = await loadImage(png);
	assertEquals("pixels" in img && [...img.pixels], [255, 0, 0, 255, 0, 0, 255, 128]);
	await assertRejects(() => loadImage(new Uint8Array([0xff, 0xd8, 0xff])), Error, "JPEG");
});
