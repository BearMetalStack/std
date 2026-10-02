import type { RawImage } from "../types.ts";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Channels per pixel for each PNG color type, and the bit depths it allows. */
const COLOR_TYPES: Record<number, { channels: number; depths: number[] }> = {
	0: { channels: 1, depths: [1, 2, 4, 8, 16] },
	2: { channels: 3, depths: [8, 16] },
	3: { channels: 1, depths: [1, 2, 4, 8] },
	4: { channels: 2, depths: [8, 16] },
	6: { channels: 4, depths: [8, 16] },
};

/** Adam7 passes as `[x0, y0, dx, dy]`. */
const ADAM7 = [
	[0, 0, 8, 8],
	[4, 0, 8, 8],
	[0, 4, 4, 8],
	[2, 0, 4, 4],
	[0, 2, 2, 4],
	[1, 0, 2, 2],
	[0, 1, 1, 2],
] as const;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(
		new DecompressionStream("deflate"),
	);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function fail(msg: string): never {
	throw new Error(`anodized: decodePng: ${msg}`);
}

/**
 * Decodes a PNG file into straight-alpha RGBA pixels. Zero dependencies: inflates with the
 * platform's `DecompressionStream`, so it works in Deno and browsers alike. Handles every
 * standard color type and bit depth, palettes, `tRNS` transparency and Adam7 interlacing;
 * 16-bit channels are rounded to 8. Checksums are not verified.
 */
export async function decodePng(bytes: Uint8Array): Promise<RawImage> {
	if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) fail("not a PNG file");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let width = 0, height = 0, depth = 0, colorType = -1, interlace = 0;
	let palette: Uint8Array | null = null;
	let trns: Uint8Array | null = null;
	const idat: Uint8Array[] = [];
	for (let o = 8; o + 8 <= bytes.length; o += 12 + view.getUint32(o)) {
		const len = view.getUint32(o);
		const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
		const data = bytes.subarray(o + 8, o + 8 + len);
		if (data.length < len) fail(`truncated ${type} chunk`);
		if (type === "IHDR") {
			width = view.getUint32(o + 8);
			height = view.getUint32(o + 12);
			[depth, colorType] = [data[8], data[9]];
			if (data[10] !== 0 || data[11] !== 0) fail("unknown compression or filter method");
			interlace = data[12];
		} else if (type === "PLTE") palette = data;
		else if (type === "tRNS") trns = data;
		else if (type === "IDAT") idat.push(data);
		else if (type === "IEND") break;
	}
	const ct = COLOR_TYPES[colorType];
	if (!width || !height) fail("missing IHDR");
	if (!ct || !ct.depths.includes(depth)) {
		fail(`unsupported color type ${colorType} at bit depth ${depth}`);
	}
	if (colorType === 3 && !palette) fail("missing palette");
	if (interlace > 1) fail(`unknown interlace method ${interlace}`);

	const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
	idat.reduce((o, d) => (joined.set(d, o), o + d.length), 0);
	const data = await inflate(joined);

	const bits = ct.channels * depth;
	const bpp = Math.max(1, bits >> 3);
	const out = new Uint8Array(width * height * 4);
	const sample = sampler(depth);
	const max = (1 << Math.min(depth, 8)) - 1;
	const to8 = depth === 16
		? (v: number) => Math.round(v / 257)
		: depth === 8
		? (v: number) => v
		: (v: number) => Math.round((v * 255) / max);
	const channels = ct.channels;
	const trnsKey = trns && (colorType === 0 || colorType === 2)
		? Array.from({ length: ct.channels }, (_, c) => (trns![c * 2] << 8) | trns![c * 2 + 1])
		: null;

	let off = 0;
	for (const [x0, y0, dx, dy] of interlace ? ADAM7 : [[0, 0, 1, 1] as const]) {
		const pw = Math.ceil((width - x0) / dx), ph = Math.ceil((height - y0) / dy);
		if (pw <= 0 || ph <= 0) continue;
		const stride = Math.ceil((pw * bits) / 8);
		let prev: Uint8Array = new Uint8Array(stride);
		for (let row = 0; row < ph; row++) {
			if (off + 1 + stride > data.length) fail("image data is truncated");
			const filter = data[off];
			const line = data.subarray(off + 1, off + 1 + stride);
			unfilter(filter, line, prev, bpp);
			off += 1 + stride;
			prev = line;
			const y = y0 + row * dy;
			for (let i = 0; i < pw; i++) {
				const p = (y * width + x0 + i * dx) * 4;
				const k = i * channels;
				if (colorType === 3) {
					const e = sample(line, k);
					if (e * 3 + 2 >= palette!.length) fail(`palette index ${e} out of range`);
					out[p] = palette![e * 3];
					out[p + 1] = palette![e * 3 + 1];
					out[p + 2] = palette![e * 3 + 2];
					out[p + 3] = trns && e < trns.length ? trns[e] : 255;
					continue;
				}
				const r = sample(line, k);
				const gray = colorType === 0 || colorType === 4;
				const g = gray ? r : sample(line, k + 1), b = gray ? r : sample(line, k + 2);
				out[p] = to8(r);
				out[p + 1] = to8(g);
				out[p + 2] = to8(b);
				if (colorType === 4) out[p + 3] = to8(sample(line, k + 1));
				else if (colorType === 6) out[p + 3] = to8(sample(line, k + 3));
				else {
					const clear = trnsKey && r === trnsKey[0] &&
						(gray || (g === trnsKey[1] && b === trnsKey[2]));
					out[p + 3] = clear ? 0 : 255;
				}
			}
		}
	}
	return { width, height, pixels: out };
}

/** Reads the `k`th sample of a scanline at a given bit depth, unscaled. */
function sampler(depth: number): (line: Uint8Array, k: number) => number {
	switch (depth) {
		case 16:
			return (l, k) => (l[k * 2] << 8) | l[k * 2 + 1];
		case 8:
			return (l, k) => l[k];
		default: {
			const mask = (1 << depth) - 1;
			return (l, k) => {
				const bit = k * depth;
				return (l[bit >> 3] >> (8 - depth - (bit & 7))) & mask;
			};
		}
	}
}

/** Reverses a scanline's filter in place, given the already-unfiltered line above it. */
function unfilter(filter: number, line: Uint8Array, prev: Uint8Array, bpp: number): void {
	const n = line.length;
	switch (filter) {
		case 0:
			return;
		case 1:
			for (let i = bpp; i < n; i++) line[i] += line[i - bpp];
			return;
		case 2:
			for (let i = 0; i < n; i++) line[i] += prev[i];
			return;
		case 3:
			for (let i = 0; i < n; i++) {
				line[i] += ((i >= bpp ? line[i - bpp] : 0) + prev[i]) >> 1;
			}
			return;
		case 4:
			for (let i = 0; i < n; i++) {
				const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
				const p = a + b - c;
				const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
				line[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			return;
		default:
			fail(`unknown filter type ${filter}`);
	}
}
