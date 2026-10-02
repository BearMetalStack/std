import type { LineHitTarget, Rect } from "../types.ts";
import type { Camera } from "../core/camera.ts";
import { type Path, Verb, VERB_ARITY } from "../geometry/path.ts";
import { wangCubic } from "../geometry/flatten.ts";

/** A clickable line recorded during a frame, in world coordinates. */
export interface LineRegion {
	target: Omit<LineHitTarget, "screen" | "labelScreen">;
	path: Path;
	strokeWidth: number;
	scaleWidth: boolean;
	/** Path segments per reported interval (e.g. 2 for step series). */
	perInterval: number;
	/** Paint order; higher is on top. */
	z: number;
	/** A label plate that also counts as the line. */
	label?: Rect;
}

/** Where a point lands on a line. */
export interface LineHit {
	region: LineRegion;
	/** Closest point on the line, world units. */
	point: [number, number];
	segment: number;
	/** World units from the start of the line. */
	along: number;
	fraction: number;
	/** Screen-pixel distance from the query point to the line. */
	distance: number;
}

const MAX_SEGMENTS = 256;

/**
 * Tests a screen point against a line. The line is flattened in screen space so thin lines stay
 * clickable at any zoom; it is a hit within half the stroke width plus `slop` pixels.
 */
export function hitLine(
	region: LineRegion,
	camera: Camera,
	sx: number,
	sy: number,
	slop = 4,
): LineHit | null {
	let qx = sx, qy = sy;
	let onLabel = false;
	if (region.label) {
		const [wx, wy] = camera.screenToWorld(sx, sy);
		const l = region.label;
		if (wx >= l.x && wx <= l.x + l.w && wy >= l.y && wy <= l.y + l.h) {
			[qx, qy] = camera.worldToScreen(l.x + l.w / 2, l.y + l.h / 2);
			onLabel = true;
		}
	}

	const c = region.path.coords;
	const S = (i: number): [number, number] => camera.worldToScreen(c[i], c[i + 1]);
	let best = { d: Infinity, x: 0, y: 0, seg: 0, along: 0 };
	let total = 0;
	let seg = -1;
	let cx = 0, cy = 0, startX = 0, startY = 0;
	const visit = (ax: number, ay: number, bx: number, by: number) => {
		const dx = bx - ax, dy = by - ay;
		const len = Math.hypot(dx, dy);
		const t = len > 0
			? Math.max(0, Math.min(1, ((qx - ax) * dx + (qy - ay) * dy) / (len * len)))
			: 0;
		const px = ax + dx * t, py = ay + dy * t;
		const d = Math.hypot(qx - px, qy - py);
		if (d < best.d) best = { d, x: px, y: py, seg, along: total + len * t };
		total += len;
	};
	let j = 0;
	for (const v of region.path.verbs) {
		switch (v) {
			case Verb.Move:
				[cx, cy] = S(j);
				startX = cx;
				startY = cy;
				break;
			case Verb.Line: {
				seg++;
				const [x, y] = S(j);
				visit(cx, cy, x, y);
				cx = x;
				cy = y;
				break;
			}
			case Verb.Quad:
			case Verb.Cubic: {
				seg++;
				const pts = v === Verb.Quad
					? elevate(cx, cy, S(j), S(j + 2))
					: [cx, cy, ...S(j), ...S(j + 2), ...S(j + 4)];
				const [x0, y0, x1, y1, x2, y2, x3, y3] = pts;
				const n = Math.min(MAX_SEGMENTS, wangCubic(x0, y0, x1, y1, x2, y2, x3, y3, 0.5));
				let px = x0, py = y0;
				for (let i = 1; i <= n; i++) {
					const t = i / n, u = 1 - t;
					const a = u * u * u, b = 3 * u * u * t, cc = 3 * u * t * t, d = t * t * t;
					const nx = a * x0 + b * x1 + cc * x2 + d * x3;
					const ny = a * y0 + b * y1 + cc * y2 + d * y3;
					visit(px, py, nx, ny);
					px = nx;
					py = ny;
				}
				cx = x3;
				cy = y3;
				break;
			}
			case Verb.Close:
				seg++;
				visit(cx, cy, startX, startY);
				cx = startX;
				cy = startY;
				break;
		}
		j += VERB_ARITY[v];
	}
	if (seg < 0 || !Number.isFinite(best.d)) return null;

	const scale = camera.scale;
	const half = (region.strokeWidth * (region.scaleWidth ? scale : 1)) / 2;
	if (!onLabel && best.d > half + slop) return null;
	const [wx, wy] = camera.screenToWorld(best.x, best.y);
	return {
		region,
		point: [wx, wy],
		segment: Math.floor(Math.max(0, best.seg) / region.perInterval),
		along: best.along / scale,
		fraction: total > 0 ? best.along / total : 0,
		distance: onLabel ? 0 : best.d,
	};
}

function elevate(
	x0: number,
	y0: number,
	[qx, qy]: [number, number],
	[x2, y2]: [number, number],
): number[] {
	return [
		x0,
		y0,
		x0 + (2 / 3) * (qx - x0),
		y0 + (2 / 3) * (qy - y0),
		x2 + (2 / 3) * (qx - x2),
		y2 + (2 / 3) * (qy - y2),
		x2,
		y2,
	];
}
