import type { Bounds } from "../types.ts";
import { clipSegment } from "./clip.ts";

/**
 * Splits a polyline into dashes. `pattern` alternates on/off lengths (an odd-length pattern is
 * repeated once, as in canvas). Parts of the line outside `view` advance the pattern without
 * emitting anything, so a line far longer than the screen stays cheap.
 */
export function dashPolyline(
	pts: number[],
	pattern: readonly number[],
	offset: number,
	view: Bounds | null,
): number[][] {
	const pat = pattern.length % 2 ? [...pattern, ...pattern] : [...pattern];
	const total = pat.reduce((a, b) => a + Math.max(0, b), 0);
	if (total <= 0 || pat.some((v) => v < 0)) return [pts];

	let idx = 0;
	let left = 0;
	{
		let o = ((offset % total) + total) % total;
		while (o >= pat[idx]) {
			o -= pat[idx];
			idx = (idx + 1) % pat.length;
		}
		left = pat[idx] - o;
	}
	const on = () => idx % 2 === 0;
	const advance = (d: number) => {
		d %= total;
		while (d >= left) {
			d -= left;
			idx = (idx + 1) % pat.length;
			left = pat[idx];
		}
		left -= d;
	};

	const out: number[][] = [];
	let cur: number[] | null = null;
	for (let i = 0; i + 3 < pts.length; i += 2) {
		const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
		const len = Math.hypot(x1 - x0, y1 - y0);
		if (len === 0) continue;
		let t0 = 0, t1 = 1;
		if (view) {
			const seg = clipSegment(x0, y0, x1, y1, view);
			if (!seg) {
				cur = null;
				advance(len);
				continue;
			}
			[t0, t1] = seg;
			if (t0 > 0) {
				cur = null;
				advance(len * t0);
			}
		}
		const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
		let pos = len * t0;
		const end = len * t1;
		while (pos < end) {
			const step = Math.min(left, end - pos);
			const next = pos + step;
			if (on()) {
				if (!cur) {
					cur = [x0 + ux * pos, y0 + uy * pos];
					out.push(cur);
				}
				cur.push(x0 + ux * next, y0 + uy * next);
			}
			pos = next;
			left -= step;
			if (left <= 1e-9) {
				idx = (idx + 1) % pat.length;
				left = pat[idx];
				cur = null;
			}
		}
		if (t1 < 1) {
			cur = null;
			advance(len * (1 - t1));
		}
	}
	return out.filter((p) => p.length >= 4);
}
