import type { LineCap, LineJoin } from "../types.ts";
import { TOLERANCE } from "./flatten.ts";

/** Stroke parameters in device pixels. */
export interface StrokeParams {
	halfWidth: number;
	join: LineJoin;
	cap: LineCap;
	miterLimit: number;
	tol?: number;
}

/**
 * Appends triangles covering the stroke of a polyline to `out`. Triangles overlap freely at
 * joins; the renderer draws strokes through a stencil union so overlaps never blend twice.
 */
export function strokePolyline(
	input: number[],
	closed: boolean,
	p: StrokeParams,
	out: number[],
): void {
	const hw = p.halfWidth;
	if (!(hw > 0)) return;
	const tol = p.tol ?? TOLERANCE;
	const pts = dedupe(input);
	if (closed && pts.length >= 4) {
		const n = pts.length;
		if (Math.abs(pts[0] - pts[n - 2]) < 1e-9 && Math.abs(pts[1] - pts[n - 1]) < 1e-9) {
			pts.length -= 2;
		}
	}
	const n = pts.length / 2;
	if (n === 0) return;
	if (n === 1) {
		if (p.cap === "round") circle(pts[0], pts[1], hw, tol, out);
		else if (p.cap === "square") {
			const [x, y] = pts;
			quad(x - hw, y - hw, x + hw, y - hw, x + hw, y + hw, x - hw, y + hw, out);
		}
		return;
	}
	if (closed && n < 3) closed = false;

	const segs = closed ? n : n - 1;
	const dirs: number[] = [];
	for (let i = 0; i < segs; i++) {
		const ax = pts[i * 2], ay = pts[i * 2 + 1];
		const j = ((i + 1) % n) * 2;
		const bx = pts[j], by = pts[j + 1];
		const len = Math.hypot(bx - ax, by - ay);
		const dx = (bx - ax) / len, dy = (by - ay) / len;
		dirs.push(dx, dy);
		const nx = -dy * hw, ny = dx * hw;
		quad(ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny, out);
	}

	const first = closed ? 0 : 1;
	const last = closed ? n : n - 1;
	for (let i = first; i < last; i++) {
		const pi = (i - 1 + segs) % segs;
		join(
			pts[i * 2],
			pts[i * 2 + 1],
			dirs[pi * 2],
			dirs[pi * 2 + 1],
			dirs[i * 2],
			dirs[i * 2 + 1],
			p,
			tol,
			out,
		);
	}

	if (!closed) {
		cap(pts[0], pts[1], -dirs[0], -dirs[1], p, tol, out);
		const k = (segs - 1) * 2;
		cap(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1], dirs[k], dirs[k + 1], p, tol, out);
	}
}

function dedupe(pts: number[]): number[] {
	const out: number[] = [];
	for (let i = 0; i + 1 < pts.length; i += 2) {
		const n = out.length;
		if (n && Math.abs(out[n - 2] - pts[i]) < 1e-9 && Math.abs(out[n - 1] - pts[i + 1]) < 1e-9) {
			continue;
		}
		out.push(pts[i], pts[i + 1]);
	}
	return out;
}

function join(
	x: number,
	y: number,
	d0x: number,
	d0y: number,
	d1x: number,
	d1y: number,
	p: StrokeParams,
	tol: number,
	out: number[],
): void {
	const hw = p.halfWidth;
	const cross = d0x * d1y - d0y * d1x;
	const dot = d0x * d1x + d0y * d1y;
	if (Math.abs(cross) < 1e-9 && dot > 0) return;
	if (p.join === "round") {
		circle(x, y, hw, tol, out);
		return;
	}
	const s = cross > 0 ? -1 : 1;
	const n0x = -d0y * s, n0y = d0x * s;
	const n1x = -d1y * s, n1y = d1x * s;
	const ax = x + n0x * hw, ay = y + n0y * hw;
	const bx = x + n1x * hw, by = y + n1y * hw;
	if (p.join === "miter") {
		const mx = n0x + n1x, my = n0y + n1y;
		const ml = Math.hypot(mx, my);
		const cosHalf = ml / 2;
		if (cosHalf > 1e-9 && 1 / cosHalf <= p.miterLimit) {
			const k = hw / cosHalf / ml;
			const tx = x + mx * k, ty = y + my * k;
			out.push(x, y, ax, ay, tx, ty, x, y, tx, ty, bx, by);
			return;
		}
	}
	out.push(x, y, ax, ay, bx, by);
}

function cap(
	x: number,
	y: number,
	dx: number,
	dy: number,
	p: StrokeParams,
	tol: number,
	out: number[],
): void {
	const hw = p.halfWidth;
	if (p.cap === "round") circle(x, y, hw, tol, out);
	else if (p.cap === "square") {
		const nx = -dy * hw, ny = dx * hw;
		const ex = dx * hw, ey = dy * hw;
		quad(x + nx, y + ny, x + nx + ex, y + ny + ey, x - nx + ex, y - ny + ey, x - nx, y - ny, out);
	}
}

/** Segments needed to keep a circle of radius `r` within `tol` of round. */
export function circleSegments(r: number, tol = TOLERANCE): number {
	if (r <= tol) return 8;
	const step = 2 * Math.acos(1 - tol / r);
	return Math.max(8, Math.min(256, Math.ceil((Math.PI * 2) / step)));
}

function circle(x: number, y: number, r: number, tol: number, out: number[]): void {
	const n = circleSegments(r, tol);
	let px = x + r, py = y;
	for (let i = 1; i <= n; i++) {
		const a = (i / n) * Math.PI * 2;
		const qx = x + Math.cos(a) * r, qy = y + Math.sin(a) * r;
		out.push(x, y, px, py, qx, qy);
		px = qx;
		py = qy;
	}
}

function quad(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	cx: number,
	cy: number,
	dx: number,
	dy: number,
	out: number[],
): void {
	out.push(ax, ay, bx, by, cx, cy, ax, ay, cx, cy, dx, dy);
}
