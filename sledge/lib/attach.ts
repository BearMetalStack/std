import type { Affine } from "./path.ts";

/** A 2D point. */
export interface Point {
	x: number;
	y: number;
}

/** Where an attached part should sit, and how far it turns, in degrees. */
export interface Pose extends Point {
	angle: number;
}

const ARITY: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, A: 7, Z: 0 };

/**
 * Flattens a normalized path into a polygon, mapping each point through `m`.
 * Arcs are approximated by a straight line to their end point.
 */
export function samplePath(
	signature: string,
	values: ArrayLike<number>,
	m: Affine,
	perCurve = 16,
): Point[] {
	const out: Point[] = [];
	const map = (x: number, y: number) =>
		out.push({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
	let o = 0, x = 0, y = 0;
	for (const c of signature) {
		const v = (i: number) => values[o + i];
		if (c === "M" || c === "L") {
			x = v(0), y = v(1);
			map(x, y);
		} else if (c === "C" || c === "Q") {
			// A quadratic is the cubic whose controls sit 2/3 of the way to its one control.
			const pts = c === "C" ? [x, y, v(0), v(1), v(2), v(3), v(4), v(5)] : [
				x,
				y,
				x + (2 / 3) * (v(0) - x),
				y + (2 / 3) * (v(1) - y),
				v(2) + (2 / 3) * (v(0) - v(2)),
				v(3) + (2 / 3) * (v(1) - v(3)),
				v(2),
				v(3),
			];
			for (let i = 1; i <= perCurve; i++) {
				const t = i / perCurve, u = 1 - t;
				const [b0, b1, b2, b3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
				map(
					b0 * pts[0] + b1 * pts[2] + b2 * pts[4] + b3 * pts[6],
					b0 * pts[1] + b1 * pts[3] + b2 * pts[5] + b3 * pts[7],
				);
			}
			x = c === "C" ? v(4) : v(2), y = c === "C" ? v(5) : v(3);
		} else if (c === "A") {
			x = v(5), y = v(6);
			map(x, y);
		}
		o += ARITY[c];
	}
	return out;
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(poly: readonly Point[], p: Point): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i], b = poly[j];
		if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside;
		}
	}
	return inside;
}

/**
 * Where a part rooted at `anchor` sits on a lid. The part stays put (`null`)
 * until the lid covers its root; from then on it rides the nearest point of
 * the lid's edge that lies inside the eye, turned to follow that edge.
 * Starting from the point that touches the root keeps the hand-off seamless.
 */
export function attachPose(
	lid: readonly Point[],
	anchor: Point,
	insideEye: (p: Point) => boolean,
): Pose | null {
	if (lid.length < 3 || !pointInPolygon(lid, anchor)) return null;
	let best: Pose | null = null, bestDist = Infinity;
	let fallback: Pose | null = null, fallbackDist = Infinity;
	for (let i = 0; i < lid.length; i++) {
		const a = lid[i], b = lid[(i + 1) % lid.length];
		const dx = b.x - a.x, dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		if (!len2) continue;
		const t = Math.max(0, Math.min(1, ((anchor.x - a.x) * dx + (anchor.y - a.y) * dy) / len2));
		const x = a.x + dx * t, y = a.y + dy * t;
		const dist = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
		let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
		if (angle > 90) angle -= 180;
		else if (angle <= -90) angle += 180;
		if (dist < fallbackDist) fallback = { x, y, angle }, fallbackDist = dist;
		if (dist < bestDist && insideEye({ x: a.x + dx / 2, y: a.y + dy / 2 })) {
			best = { x, y, angle }, bestDist = dist;
		}
	}
	return best ?? fallback;
}
