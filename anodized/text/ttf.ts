import { Path } from "../geometry/path.ts";

interface TableRecord {
	offset: number;
	length: number;
}

/**
 * A parsed TrueType font. Glyph outlines come back as {@linkcode Path}s in font units (y up),
 * so text goes through the same vector pipeline as every other shape and stays sharp at any zoom.
 *
 * Supports `glyf` outlines (simple and composite), `cmap` formats 4 and 12, and `kern` format 0.
 * CFF-flavoured OpenType fonts are rejected with an error; GPOS kerning and complex shaping are
 * not implemented.
 */
export class Font {
	readonly unitsPerEm: number;
	readonly ascender: number;
	readonly descender: number;
	readonly lineGap: number;
	readonly numGlyphs: number;
	#view: DataView;
	#tables: Map<string, TableRecord>;
	#loca: Uint32Array;
	#advances: Uint16Array;
	#cmap: (cp: number) => number;
	#kern = new Map<number, number>();
	#glyphCache = new Map<number, Path>();
	#cpCache = new Map<number, number>();

	constructor(data: ArrayBuffer | Uint8Array) {
		const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const v = this.#view;
		let base = 0;
		const tag = (o: number) =>
			String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
		if (tag(0) === "ttcf") base = v.getUint32(12);
		const flavor = v.getUint32(base);
		if (tag(base) === "OTTO") {
			throw new Error(
				"anodized: CFF-outline (OTTO) fonts are not supported yet; use a TrueType font",
			);
		}
		if (flavor !== 0x00010000 && tag(base) !== "true") {
			throw new Error("anodized: not a TrueType font");
		}
		const numTables = v.getUint16(base + 4);
		this.#tables = new Map();
		for (let i = 0; i < numTables; i++) {
			const r = base + 12 + i * 16;
			this.#tables.set(tag(r), { offset: v.getUint32(r + 8), length: v.getUint32(r + 12) });
		}
		for (const t of ["head", "hhea", "maxp", "hmtx", "cmap", "loca", "glyf"]) {
			if (!this.#tables.has(t)) throw new Error(`anodized: font is missing the '${t}' table`);
		}

		const head = this.#table("head");
		this.unitsPerEm = v.getUint16(head + 18);
		const longLoca = v.getInt16(head + 50) === 1;

		const hhea = this.#table("hhea");
		this.ascender = v.getInt16(hhea + 4);
		this.descender = v.getInt16(hhea + 6);
		this.lineGap = v.getInt16(hhea + 8);
		const numHMetrics = v.getUint16(hhea + 34);

		this.numGlyphs = v.getUint16(this.#table("maxp") + 4);

		const hmtx = this.#table("hmtx");
		this.#advances = new Uint16Array(this.numGlyphs);
		for (let i = 0; i < this.numGlyphs; i++) {
			this.#advances[i] = v.getUint16(hmtx + Math.min(i, numHMetrics - 1) * 4);
		}

		const loca = this.#table("loca");
		this.#loca = new Uint32Array(this.numGlyphs + 1);
		for (let i = 0; i <= this.numGlyphs; i++) {
			this.#loca[i] = longLoca ? v.getUint32(loca + i * 4) : v.getUint16(loca + i * 2) * 2;
		}

		this.#cmap = this.#parseCmap();
		if (this.#tables.has("kern")) this.#parseKern();
	}

	#table(name: string): number {
		return this.#tables.get(name)!.offset;
	}

	#parseCmap(): (cp: number) => number {
		const v = this.#view;
		const cmap = this.#table("cmap");
		const n = v.getUint16(cmap + 2);
		let fmt4 = -1, fmt12 = -1;
		for (let i = 0; i < n; i++) {
			const r = cmap + 4 + i * 8;
			const platform = v.getUint16(r), encoding = v.getUint16(r + 2);
			const sub = cmap + v.getUint32(r + 4);
			const format = v.getUint16(sub);
			const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
			if (!unicode) continue;
			if (format === 12 && fmt12 < 0) fmt12 = sub;
			if (format === 4 && fmt4 < 0) fmt4 = sub;
		}
		if (fmt12 >= 0) {
			const groups = v.getUint32(fmt12 + 12);
			return (cp) => {
				let lo = 0, hi = groups - 1;
				while (lo <= hi) {
					const mid = (lo + hi) >> 1;
					const g = fmt12 + 16 + mid * 12;
					const start = v.getUint32(g), end = v.getUint32(g + 4);
					if (cp < start) hi = mid - 1;
					else if (cp > end) lo = mid + 1;
					else return v.getUint32(g + 8) + (cp - start);
				}
				return 0;
			};
		}
		if (fmt4 >= 0) {
			const segX2 = v.getUint16(fmt4 + 6);
			const ends = fmt4 + 14;
			const starts = ends + segX2 + 2;
			const deltas = starts + segX2;
			const ranges = deltas + segX2;
			return (cp) => {
				if (cp > 0xffff) return 0;
				let lo = 0, hi = segX2 / 2 - 1;
				while (lo <= hi) {
					const mid = (lo + hi) >> 1;
					const end = v.getUint16(ends + mid * 2);
					const start = v.getUint16(starts + mid * 2);
					if (cp > end) lo = mid + 1;
					else if (cp < start) hi = mid - 1;
					else {
						const delta = v.getInt16(deltas + mid * 2);
						const ro = v.getUint16(ranges + mid * 2);
						if (ro === 0) return (cp + delta) & 0xffff;
						const g = v.getUint16(ranges + mid * 2 + ro + (cp - start) * 2);
						return g === 0 ? 0 : (g + delta) & 0xffff;
					}
				}
				return 0;
			};
		}
		throw new Error("anodized: font has no Unicode cmap (format 4 or 12)");
	}

	#parseKern(): void {
		const v = this.#view;
		const kern = this.#table("kern");
		if (v.getUint16(kern) !== 0) return;
		const n = v.getUint16(kern + 2);
		let o = kern + 4;
		for (let t = 0; t < n; t++) {
			const length = v.getUint16(o + 2);
			const coverage = v.getUint16(o + 4);
			if (coverage >> 8 === 0 && coverage & 1) {
				const pairs = v.getUint16(o + 6);
				for (let i = 0; i < pairs; i++) {
					const p = o + 14 + i * 6;
					this.#kern.set((v.getUint16(p) << 16) | v.getUint16(p + 2), v.getInt16(p + 4));
				}
			}
			o += length;
		}
	}

	/** Glyph id for a Unicode code point; `0` (`.notdef`) when the font lacks it. */
	glyphIndex(codePoint: number): number {
		let g = this.#cpCache.get(codePoint);
		if (g === undefined) {
			g = this.#cmap(codePoint);
			if (g >= this.numGlyphs) g = 0;
			this.#cpCache.set(codePoint, g);
		}
		return g;
	}

	/** Advance width of a glyph, in font units. */
	advance(glyph: number): number {
		return this.#advances[glyph] ?? 0;
	}

	/** Kerning adjustment between two glyphs, in font units. */
	kerning(left: number, right: number): number {
		return this.#kern.get((left << 16) | right) ?? 0;
	}

	/** `true` when the font has a `kern` table with horizontal pairs. */
	get hasKerning(): boolean {
		return this.#kern.size > 0;
	}

	/** A glyph's outline in font units, y up. Cached. */
	glyphPath(glyph: number): Path {
		let p = this.#glyphCache.get(glyph);
		if (!p) {
			p = new Path();
			this.#appendGlyph(p, glyph, [1, 0, 0, 1, 0, 0], 0);
			this.#glyphCache.set(glyph, p);
		}
		return p;
	}

	#appendGlyph(path: Path, glyph: number, m: number[], depth: number): void {
		if (glyph < 0 || glyph >= this.numGlyphs || depth > 8) return;
		const start = this.#loca[glyph], end = this.#loca[glyph + 1];
		if (end <= start) return;
		const v = this.#view;
		const g = this.#table("glyf") + start;
		const contours = v.getInt16(g);
		if (contours >= 0) this.#simpleGlyph(path, g, contours, m);
		else this.#compositeGlyph(path, g, m, depth);
	}

	#simpleGlyph(path: Path, g: number, contours: number, m: number[]): void {
		const v = this.#view;
		const endPts: number[] = [];
		for (let i = 0; i < contours; i++) endPts.push(v.getUint16(g + 10 + i * 2));
		const count = contours ? endPts[contours - 1] + 1 : 0;
		let o = g + 10 + contours * 2;
		o += 2 + v.getUint16(o);
		const flags = new Uint8Array(count);
		for (let i = 0; i < count;) {
			const f = v.getUint8(o++);
			flags[i++] = f;
			if (f & 8) {
				let r = v.getUint8(o++);
				while (r-- > 0 && i < count) flags[i++] = f;
			}
		}
		const xs = new Float64Array(count), ys = new Float64Array(count);
		let x = 0;
		for (let i = 0; i < count; i++) {
			const f = flags[i];
			if (f & 2) {
				const d = v.getUint8(o++);
				x += f & 16 ? d : -d;
			} else if (!(f & 16)) {
				x += v.getInt16(o);
				o += 2;
			}
			xs[i] = x;
		}
		let y = 0;
		for (let i = 0; i < count; i++) {
			const f = flags[i];
			if (f & 4) {
				const d = v.getUint8(o++);
				y += f & 32 ? d : -d;
			} else if (!(f & 32)) {
				y += v.getInt16(o);
				o += 2;
			}
			ys[i] = y;
		}
		const tx = (i: number) => m[0] * xs[i] + m[2] * ys[i] + m[4];
		const ty = (i: number) => m[1] * xs[i] + m[3] * ys[i] + m[5];
		let s = 0;
		for (const e of endPts) {
			appendContour(path, s, e, (i) => [tx(i), ty(i), (flags[i] & 1) === 1]);
			s = e + 1;
		}
	}

	#compositeGlyph(path: Path, g: number, m: number[], depth: number): void {
		const v = this.#view;
		let o = g + 10;
		for (;;) {
			const flags = v.getUint16(o);
			const glyph = v.getUint16(o + 2);
			o += 4;
			let dx: number, dy: number;
			if (flags & 1) {
				dx = v.getInt16(o);
				dy = v.getInt16(o + 2);
				o += 4;
			} else {
				dx = v.getInt8(o);
				dy = v.getInt8(o + 1);
				o += 2;
			}
			if (!(flags & 2)) dx = dy = 0;
			let a = 1, b = 0, c = 0, d = 1;
			const f2 = (p: number) => v.getInt16(p) / 16384;
			if (flags & 8) {
				a = d = f2(o);
				o += 2;
			} else if (flags & 0x40) {
				a = f2(o);
				d = f2(o + 2);
				o += 4;
			} else if (flags & 0x80) {
				a = f2(o);
				b = f2(o + 2);
				c = f2(o + 4);
				d = f2(o + 6);
				o += 8;
			}
			const cm = [
				m[0] * a + m[2] * b,
				m[1] * a + m[3] * b,
				m[0] * c + m[2] * d,
				m[1] * c + m[3] * d,
				m[0] * dx + m[2] * dy + m[4],
				m[1] * dx + m[3] * dy + m[5],
			];
			this.#appendGlyph(path, glyph, cm, depth + 1);
			if (!(flags & 0x20)) break;
		}
	}
}

/** Emits one TrueType quadratic contour, synthesizing the implied on-curve midpoints. */
function appendContour(
	path: Path,
	s: number,
	e: number,
	pt: (i: number) => [number, number, boolean],
): void {
	const n = e - s + 1;
	if (n < 2) return;
	const at = (k: number) => pt(s + (((k % n) + n) % n));
	let first = 0;
	while (first < n && !at(first)[2]) first++;
	let sx: number, sy: number;
	if (first === n) {
		const [ax, ay] = at(0), [bx, by] = at(1);
		sx = (ax + bx) / 2;
		sy = (ay + by) / 2;
		first = 0;
	} else {
		[sx, sy] = at(first);
	}
	path.moveTo(sx, sy);
	let ctrl: [number, number] | null = null;
	for (let k = 1; k <= n; k++) {
		const [x, y, on] = at(first + k);
		if (on) {
			if (ctrl) path.quadTo(ctrl[0], ctrl[1], x, y);
			else path.lineTo(x, y);
			ctrl = null;
		} else if (ctrl) {
			const mx = (ctrl[0] + x) / 2, my = (ctrl[1] + y) / 2;
			path.quadTo(ctrl[0], ctrl[1], mx, my);
			ctrl = [x, y];
		} else {
			ctrl = [x, y];
		}
	}
	if (ctrl) path.quadTo(ctrl[0], ctrl[1], sx, sy);
	path.close();
}

/** Parses font bytes. */
export function parseFont(data: ArrayBuffer | Uint8Array): Font {
	return new Font(data);
}

/** Loads a font from bytes, or fetches it from a URL. */
export async function loadFont(src: ArrayBuffer | Uint8Array | URL | string): Promise<Font> {
	if (typeof src === "string" || src instanceof URL) {
		const res = await fetch(src);
		if (!res.ok) throw new Error(`anodized: failed to fetch font ${src}: ${res.status}`);
		return new Font(await res.arrayBuffer());
	}
	return new Font(src);
}
