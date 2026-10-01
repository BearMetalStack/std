import { assertEquals } from "@std/assert";
import { crc32, encodePng } from "./png.ts";

async function inflate(data: Uint8Array): Promise<Uint8Array> {
	const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
	return new Uint8Array(await new Response(s).arrayBuffer());
}

Deno.test("PNG round-trips pixels and has valid CRCs", async () => {
	const w = 7, h = 5;
	const px = new Uint8Array(w * h * 4).map((_, i) => (i * 37) & 0xff);
	const png = await encodePng(w, h, px);
	assertEquals([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const v = new DataView(png.buffer);
	let o = 8;
	let idat = new Uint8Array();
	while (o < png.length) {
		const len = v.getUint32(o);
		const type = new TextDecoder().decode(png.subarray(o + 4, o + 8));
		const crc = (crc32(png.subarray(o + 4, o + 8 + len)) ^ 0xffffffff) >>> 0;
		assertEquals(crc, v.getUint32(o + 8 + len), `bad CRC on ${type}`);
		if (type === "IHDR") {
			assertEquals([v.getUint32(o + 8), v.getUint32(o + 12)], [w, h]);
		}
		if (type === "IDAT") idat = png.slice(o + 8, o + 8 + len);
		o += 12 + len;
	}
	const raw = await inflate(idat);
	const row = w * 4;
	const out = new Uint8Array(w * h * 4);
	for (let y = 0; y < h; y++) {
		assertEquals(raw[y * (row + 1)], 1);
		for (let x = 0; x < row; x++) {
			const left = x >= 4 ? out[y * row + x - 4] : 0;
			out[y * row + x] = (raw[y * (row + 1) + 1 + x] + left) & 0xff;
		}
	}
	assertEquals(out, px);
});
