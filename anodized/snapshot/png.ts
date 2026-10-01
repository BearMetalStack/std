const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

/** CRC-32 as used by PNG chunks. */
export function crc32(bytes: Uint8Array, crc = 0xffffffff): number {
	for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	return crc;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, (crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0);
	return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(
		new CompressionStream("deflate"),
	);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Encodes straight-alpha RGBA pixels as a PNG. Zero dependencies: rows use the Sub filter and
 * are compressed with the platform's `CompressionStream("deflate")`, which emits the zlib
 * framing PNG requires. Works the same in browsers and Deno.
 */
export async function encodePng(
	width: number,
	height: number,
	rgba: Uint8Array,
): Promise<Uint8Array> {
	if (rgba.length !== width * height * 4) {
		throw new Error(`anodized: expected ${width * height * 4} bytes of RGBA, got ${rgba.length}`);
	}
	const row = width * 4;
	const raw = new Uint8Array((row + 1) * height);
	for (let y = 0; y < height; y++) {
		const o = y * (row + 1);
		const src = y * row;
		raw[o] = 1;
		for (let x = 0; x < row; x++) {
			raw[o + 1 + x] = (rgba[src + x] - (x >= 4 ? rgba[src + x - 4] : 0)) & 0xff;
		}
	}
	const ihdr = new Uint8Array(13);
	const v = new DataView(ihdr.buffer);
	v.setUint32(0, width);
	v.setUint32(4, height);
	ihdr.set([8, 6, 0, 0, 0], 8);
	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", await deflate(raw)),
		chunk("IEND", new Uint8Array(0)),
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}
