import type { Point } from "../types.ts";

/** Extent of the data a chart draws. */
export interface Domain {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

/**
 * The extent covering every series. The y-axis starts at zero unless the data goes negative, and
 * a flat line gets headroom so it does not sit on the top edge.
 */
export function domainOf(series: Point[][]): Domain {
	let x0 = Infinity, x1 = -Infinity, y0 = 0, y1 = -Infinity;
	for (const points of series) {
		for (const [x, y] of points) {
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		}
	}
	if (x0 === Infinity) return { x0: 0, x1: 1, y0: 0, y1: 1 };
	if (x1 === x0) x1 = x0 + 1;
	if (y1 <= y0) y1 = y0 + 1;
	return { x0, x1, y0, y1: y1 * 1.1 };
}

function project([x, y]: Point, w: number, h: number, d: Domain): [number, number] {
	const px = ((x - d.x0) / (d.x1 - d.x0)) * w;
	const py = h - ((y - d.y0) / (d.y1 - d.y0)) * h;
	return [Math.round(px * 100) / 100, Math.round(py * 100) / 100];
}

/** An SVG path through `points`, scaled into a `w` × `h` box. */
export function linePath(points: Point[], w: number, h: number, d: Domain): string {
	return points
		.map((p, i) => {
			const [x, y] = project(p, w, h, d);
			return `${i === 0 ? "M" : "L"}${x} ${y}`;
		})
		.join(" ");
}

/** {@link linePath} closed down to the baseline, for a filled area. */
export function areaPath(points: Point[], w: number, h: number, d: Domain): string {
	if (points.length === 0) return "";
	const line = linePath(points, w, h, d);
	const [first] = project(points[0], w, h, d);
	const [last] = project(points[points.length - 1], w, h, d);
	return `${line} L${last} ${h} L${first} ${h} Z`;
}

/** Fraction (0-1) of the way `value` is from `min` to `max`, clamped. */
export function fraction(value: number, min: number, max: number): number {
	if (max <= min) return 0;
	return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
