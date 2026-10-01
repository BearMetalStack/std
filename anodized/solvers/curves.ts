import type { CurveKind, Point } from "../types.ts";
import { Path } from "../geometry/path.ts";

/**
 * Appends a curve through `points` to `path`. With `connect`, the first point is joined with a
 * line from the current point instead of starting a new contour.
 *
 * - `linear`: straight segments.
 * - `monotone`: Fritsch–Carlson monotone cubic in x. Never overshoots between points, so it is
 *   the safe default for charts. Assumes x is sorted.
 * - `catmullRom`: cardinal spline; `tension` 0 is classic Catmull-Rom, 1 is straight lines.
 * - `stepBefore` / `stepAfter` / `stepMiddle`: horizontal-then-vertical steps.
 */
export function appendCurve(
	path: Path,
	points: readonly Point[],
	kind: CurveKind = "linear",
	tension = 0,
	connect = false,
): Path {
	const n = points.length;
	if (!n) return path;
	const [x0, y0] = points[0];
	if (connect) path.lineTo(x0, y0);
	else path.moveTo(x0, y0);
	if (n === 1) return path;
	switch (kind) {
		case "monotone":
			return monotone(path, points);
		case "catmullRom":
			return cardinal(path, points, tension);
		case "stepBefore":
		case "stepAfter":
		case "stepMiddle":
			for (let i = 1; i < n; i++) {
				const [ax, ay] = points[i - 1];
				const [bx, by] = points[i];
				if (kind === "stepAfter") path.lineTo(bx, ay);
				else if (kind === "stepBefore") path.lineTo(ax, by);
				else {
					const mx = (ax + bx) / 2;
					path.lineTo(mx, ay).lineTo(mx, by);
				}
				path.lineTo(bx, by);
			}
			return path;
		default:
			for (let i = 1; i < n; i++) path.lineTo(points[i][0], points[i][1]);
			return path;
	}
}

/** An open path through `points`. */
export function curvePath(points: readonly Point[], kind?: CurveKind, tension?: number): Path {
	return appendCurve(new Path(), points, kind, tension);
}

/** A closed path filling between the curve and the horizontal line `y = baseline`. */
export function areaPath(
	points: readonly Point[],
	baseline: number,
	kind?: CurveKind,
	tension?: number,
): Path {
	const p = new Path();
	if (points.length < 2) return p;
	p.moveTo(points[0][0], baseline);
	appendCurve(p, points, kind, tension, true);
	p.lineTo(points[points.length - 1][0], baseline);
	return p.close();
}

/** Tangents for a monotone cubic through `points`. */
export function monotoneTangents(points: readonly Point[]): number[] {
	const n = points.length;
	const m = new Array<number>(n).fill(0);
	if (n < 2) return m;
	const h: number[] = [];
	const s: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		h.push(points[i + 1][0] - points[i][0]);
		s.push(h[i] ? (points[i + 1][1] - points[i][1]) / h[i] : 0);
	}
	if (n === 2) return [s[0], s[0]];
	for (let i = 1; i < n - 1; i++) {
		const s0 = s[i - 1], s1 = s[i];
		const p = (s0 * h[i] + s1 * h[i - 1]) / (h[i - 1] + h[i] || 1);
		m[i] = (Math.sign(s0) + Math.sign(s1)) *
				Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
	}
	m[0] = endTangent(s[0], m[1]);
	m[n - 1] = endTangent(s[n - 2], m[n - 2]);
	return m;
}

function endTangent(secant: number, inner: number): number {
	const t = (3 * secant - inner) / 2;
	if (Math.sign(t) !== Math.sign(secant)) return 0;
	return Math.abs(t) > 3 * Math.abs(secant) ? 3 * secant : t;
}

function monotone(path: Path, points: readonly Point[]): Path {
	const m = monotoneTangents(points);
	for (let i = 0; i < points.length - 1; i++) {
		const [x0, y0] = points[i];
		const [x1, y1] = points[i + 1];
		const dx = (x1 - x0) / 3;
		path.cubicTo(x0 + dx, y0 + dx * m[i], x1 - dx, y1 - dx * m[i + 1], x1, y1);
	}
	return path;
}

function cardinal(path: Path, points: readonly Point[], tension: number): Path {
	const k = (1 - Math.max(0, Math.min(1, tension))) / 6;
	const n = points.length;
	for (let i = 0; i < n - 1; i++) {
		const p0 = points[Math.max(0, i - 1)];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[Math.min(n - 1, i + 2)];
		path.cubicTo(
			p1[0] + k * (p2[0] - p0[0]),
			p1[1] + k * (p2[1] - p0[1]),
			p2[0] - k * (p3[0] - p1[0]),
			p2[1] - k * (p3[1] - p1[1]),
			p2[0],
			p2[1],
		);
	}
	return path;
}
