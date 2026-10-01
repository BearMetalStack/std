import type { Bounds } from "../types.ts";
import type { Transform } from "../core/camera.ts";
import { type Path, Verb, VERB_ARITY } from "./path.ts";

/** A flattened contour in device pixels: `[x0, y0, x1, y1, …]`. */
export interface Polyline {
	pts: number[];
	closed: boolean;
}

/** Default flattening tolerance, in device pixels. */
export const TOLERANCE = 0.25;

const MAX_UNIFORM = 64;
const MAX_DEPTH = 64;

/**
 * Flattens `path` into device-space polylines through transform `t`.
 *
 * Curves are subdivided adaptively (Wang's formula) so the error stays under `tol` pixels at any
 * zoom. A curve whose control hull lies entirely outside `view` is replaced by its control
 * polygon instead: the region between curve and hull never touches the viewport, so winding
 * numbers inside it are unchanged, and a curve millions of pixels long costs a handful of points.
 */
export function flattenPath(
	path: Path,
	t: Transform,
	view: Bounds | null,
	tol = TOLERANCE,
): Polyline[] {
	const out: Polyline[] = [];
	const c = path.coords;
	const X = (x: number) => (x - t.cx) * t.s + t.ox;
	const Y = (y: number) => (y - t.cy) * t.s + t.oy;
	let cur: Polyline | null = null;
	let lx = 0, ly = 0;
	let j = 0;
	const push = () => {
		if (cur && cur.pts.length >= 4) out.push(cur);
	};
	for (const v of path.verbs) {
		switch (v) {
			case Verb.Move:
				push();
				lx = X(c[j]);
				ly = Y(c[j + 1]);
				cur = { pts: [lx, ly], closed: false };
				break;
			case Verb.Line:
				lx = X(c[j]);
				ly = Y(c[j + 1]);
				cur!.pts.push(lx, ly);
				break;
			case Verb.Quad: {
				const x1 = X(c[j]), y1 = Y(c[j + 1]), x2 = X(c[j + 2]), y2 = Y(c[j + 3]);
				// Degree elevation keeps one subdivision routine.
				cubic(
					cur!.pts,
					lx,
					ly,
					lx + (2 / 3) * (x1 - lx),
					ly + (2 / 3) * (y1 - ly),
					x2 + (2 / 3) * (x1 - x2),
					y2 + (2 / 3) * (y1 - y2),
					x2,
					y2,
					view,
					tol,
					0,
				);
				lx = x2;
				ly = y2;
				break;
			}
			case Verb.Cubic: {
				const x3 = X(c[j + 4]), y3 = Y(c[j + 5]);
				cubic(
					cur!.pts,
					lx,
					ly,
					X(c[j]),
					Y(c[j + 1]),
					X(c[j + 2]),
					Y(c[j + 3]),
					x3,
					y3,
					view,
					tol,
					0,
				);
				lx = x3;
				ly = y3;
				break;
			}
			case Verb.Close:
				if (cur) {
					cur.closed = true;
					push();
					lx = cur.pts[0];
					ly = cur.pts[1];
					cur = { pts: [lx, ly], closed: false };
				}
				break;
		}
		j += VERB_ARITY[v];
	}
	push();
	return out;
}

/** Number of segments that keep a cubic within `tol` of its chords (Wang's formula). */
export function wangCubic(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	x3: number,
	y3: number,
	tol: number,
): number {
	const ax = x0 - 2 * x1 + x2, ay = y0 - 2 * y1 + y2;
	const bx = x1 - 2 * x2 + x3, by = y1 - 2 * y2 + y3;
	const m = Math.sqrt(Math.max(ax * ax + ay * ay, bx * bx + by * by));
	return Math.max(1, Math.ceil(Math.sqrt((0.75 * m) / tol)));
}

function cubic(
	out: number[],
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	x3: number,
	y3: number,
	view: Bounds | null,
	tol: number,
	depth: number,
): void {
	if (view) {
		const minX = Math.min(x0, x1, x2, x3), maxX = Math.max(x0, x1, x2, x3);
		const minY = Math.min(y0, y1, y2, y3), maxY = Math.max(y0, y1, y2, y3);
		if (maxX < view.minX || minX > view.maxX || maxY < view.minY || minY > view.maxY) {
			out.push(x1, y1, x2, y2, x3, y3);
			return;
		}
	}
	const n = wangCubic(x0, y0, x1, y1, x2, y2, x3, y3, tol);
	if (n <= MAX_UNIFORM || depth >= MAX_DEPTH) {
		for (let i = 1; i <= n; i++) {
			const t = i / n, u = 1 - t;
			const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
			out.push(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
		}
		return;
	}
	const ax = (x0 + x1) / 2, ay = (y0 + y1) / 2;
	const bx = (x1 + x2) / 2, by = (y1 + y2) / 2;
	const cx = (x2 + x3) / 2, cy = (y2 + y3) / 2;
	const dx = (ax + bx) / 2, dy = (ay + by) / 2;
	const ex = (bx + cx) / 2, ey = (by + cy) / 2;
	const mx = (dx + ex) / 2, my = (dy + ey) / 2;
	cubic(out, x0, y0, ax, ay, dx, dy, mx, my, view, tol, depth + 1);
	cubic(out, mx, my, ex, ey, cx, cy, x3, y3, view, tol, depth + 1);
}
