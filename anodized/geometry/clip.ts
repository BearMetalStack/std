import type { Bounds } from "../types.ts";

/**
 * Clips a closed polygon (flat `[x, y, …]`) against a rectangle, Sutherland–Hodgman style.
 * Works for concave and self-intersecting input: the result may contain degenerate edges along
 * the rectangle's border, but winding numbers inside the rectangle are preserved, which is all
 * the stencil fill needs.
 */
export function clipPolygon(pts: number[], b: Bounds): number[] {
	let poly = pts;
	poly = clipEdge(poly, (x) => x >= b.minX, (x0, y0, x1, y1) => {
		const t = (b.minX - x0) / (x1 - x0);
		return [b.minX, y0 + (y1 - y0) * t];
	}, 0);
	poly = clipEdge(poly, (x) => x <= b.maxX, (x0, y0, x1, y1) => {
		const t = (b.maxX - x0) / (x1 - x0);
		return [b.maxX, y0 + (y1 - y0) * t];
	}, 0);
	poly = clipEdge(poly, (y) => y >= b.minY, (x0, y0, x1, y1) => {
		const t = (b.minY - y0) / (y1 - y0);
		return [x0 + (x1 - x0) * t, b.minY];
	}, 1);
	poly = clipEdge(poly, (y) => y <= b.maxY, (x0, y0, x1, y1) => {
		const t = (b.maxY - y0) / (y1 - y0);
		return [x0 + (x1 - x0) * t, b.maxY];
	}, 1);
	return poly;
}

function clipEdge(
	pts: number[],
	inside: (v: number) => boolean,
	cross: (x0: number, y0: number, x1: number, y1: number) => [number, number],
	axis: 0 | 1,
): number[] {
	const n = pts.length;
	if (n < 6) return [];
	const out: number[] = [];
	let px = pts[n - 2], py = pts[n - 1];
	let pin = inside(axis ? py : px);
	for (let i = 0; i < n; i += 2) {
		const x = pts[i], y = pts[i + 1];
		const cin = inside(axis ? y : x);
		if (cin) {
			if (!pin) out.push(...cross(px, py, x, y));
			out.push(x, y);
		} else if (pin) {
			out.push(...cross(px, py, x, y));
		}
		px = x;
		py = y;
		pin = cin;
	}
	return out;
}

/** `true` when every point of the box lies within the bounds. */
export function containsBounds(outer: Bounds, inner: Bounds): boolean {
	return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY &&
		inner.maxY <= outer.maxY;
}

/** Bounds of a flat point list. */
export function pointBounds(pts: number[]): Bounds {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (let i = 0; i < pts.length; i += 2) {
		const x = pts[i], y = pts[i + 1];
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	return { minX, minY, maxX, maxY };
}

/**
 * Clips an open polyline against a rectangle (Liang–Barsky per segment), splitting it wherever
 * it leaves and re-enters. Used for strokes, so `b` should already be grown by the stroke's reach.
 */
export function clipPolyline(pts: number[], b: Bounds): number[][] {
	const out: number[][] = [];
	let cur: number[] | null = null;
	for (let i = 0; i + 3 < pts.length; i += 2) {
		const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
		const seg = clipSegment(x0, y0, x1, y1, b);
		if (!seg) {
			cur = null;
			continue;
		}
		const [t0, t1] = seg;
		const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0;
		const bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1;
		if (!cur || t0 > 0) {
			cur = [ax, ay];
			out.push(cur);
		}
		cur.push(bx, by);
		if (t1 < 1) cur = null;
	}
	return out;
}

/** Parametric range of a segment inside `b`, or `null` when it misses entirely. */
export function clipSegment(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	b: Bounds,
): [number, number] | null {
	const dx = x1 - x0, dy = y1 - y0;
	let t0 = 0, t1 = 1;
	const p = [-dx, dx, -dy, dy];
	const q = [x0 - b.minX, b.maxX - x0, y0 - b.minY, b.maxY - y0];
	for (let i = 0; i < 4; i++) {
		if (p[i] === 0) {
			if (q[i] < 0) return null;
			continue;
		}
		const r = q[i] / p[i];
		if (p[i] < 0) {
			if (r > t1) return null;
			if (r > t0) t0 = r;
		} else {
			if (r < t0) return null;
			if (r < t1) t1 = r;
		}
	}
	return [t0, t1];
}
