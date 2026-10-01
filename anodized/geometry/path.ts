import type { Bounds } from "../types.ts";

/** Path verbs, stored compactly in {@linkcode Path.verbs}. */
export const Verb = { Move: 0, Line: 1, Quad: 2, Cubic: 3, Close: 4 } as const;
/** A path verb. */
export type Verb = typeof Verb[keyof typeof Verb];

/** Coordinates consumed by each verb. */
export const VERB_ARITY = [2, 2, 4, 6, 0] as const;

/**
 * A vector path in world coordinates: lines, quadratic and cubic Béziers. Arcs and ellipses are
 * converted to cubics as they are added. Holds no GPU state and is cheap to build every frame.
 */
export class Path {
	/** One entry per segment. */
	readonly verbs: Verb[] = [];
	/** Flat coordinates, consumed in order by {@linkcode verbs}. */
	readonly coords: number[] = [];
	#startX = 0;
	#startY = 0;
	#lastX = 0;
	#lastY = 0;
	#open = false;

	/** `true` when nothing has been added. */
	get empty(): boolean {
		return this.verbs.length === 0;
	}

	/** Starts a new contour. */
	moveTo(x: number, y: number): this {
		this.verbs.push(Verb.Move);
		this.coords.push(x, y);
		this.#startX = this.#lastX = x;
		this.#startY = this.#lastY = y;
		this.#open = true;
		return this;
	}

	#ensure(): void {
		if (!this.#open) this.moveTo(this.#lastX, this.#lastY);
	}

	lineTo(x: number, y: number): this {
		this.#ensure();
		this.verbs.push(Verb.Line);
		this.coords.push(x, y);
		this.#lastX = x;
		this.#lastY = y;
		return this;
	}

	quadTo(cx: number, cy: number, x: number, y: number): this {
		this.#ensure();
		this.verbs.push(Verb.Quad);
		this.coords.push(cx, cy, x, y);
		this.#lastX = x;
		this.#lastY = y;
		return this;
	}

	cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
		this.#ensure();
		this.verbs.push(Verb.Cubic);
		this.coords.push(c1x, c1y, c2x, c2y, x, y);
		this.#lastX = x;
		this.#lastY = y;
		return this;
	}

	/** Closes the current contour back to its starting point. */
	close(): this {
		if (!this.#open) return this;
		this.verbs.push(Verb.Close);
		this.#lastX = this.#startX;
		this.#lastY = this.#startY;
		this.#open = false;
		return this;
	}

	/**
	 * An elliptical arc from angle `a0` to `a1` (radians, clockwise on screen since y points down).
	 * Continues the current contour with a line to the arc's start, or starts one.
	 */
	ellipseArc(
		cx: number,
		cy: number,
		rx: number,
		ry: number,
		a0: number,
		a1: number,
	): this {
		const sweep = a1 - a0;
		const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
		const step = sweep / n;
		const k = (4 / 3) * Math.tan(step / 4);
		let x0 = cx + Math.cos(a0) * rx;
		let y0 = cy + Math.sin(a0) * ry;
		if (this.#open) this.lineTo(x0, y0);
		else this.moveTo(x0, y0);
		let a = a0;
		for (let i = 0; i < n; i++) {
			const b = a + step;
			const x1 = cx + Math.cos(b) * rx;
			const y1 = cy + Math.sin(b) * ry;
			this.cubicTo(
				x0 - k * Math.sin(a) * rx,
				y0 + k * Math.cos(a) * ry,
				x1 + k * Math.sin(b) * rx,
				y1 - k * Math.cos(b) * ry,
				x1,
				y1,
			);
			x0 = x1;
			y0 = y1;
			a = b;
		}
		return this;
	}

	/** A circular arc; see {@linkcode ellipseArc}. */
	arc(cx: number, cy: number, r: number, a0: number, a1: number): this {
		return this.ellipseArc(cx, cy, r, r, a0, a1);
	}

	/**
	 * A tangent arc, like canvas `arcTo`: rounds the corner at `(x1, y1)` between the current point
	 * and `(x2, y2)` with radius `r`.
	 */
	arcTo(x1: number, y1: number, x2: number, y2: number, r: number): this {
		this.#ensure();
		const x0 = this.#lastX, y0 = this.#lastY;
		const ax = x0 - x1, ay = y0 - y1, bx = x2 - x1, by = y2 - y1;
		const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
		const cross = ax * by - ay * bx;
		if (r <= 0 || la === 0 || lb === 0 || Math.abs(cross) < 1e-12 * la * lb) {
			return this.lineTo(x1, y1);
		}
		const cos = (ax * bx + ay * by) / (la * lb);
		const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
		const d = Math.min(r / Math.tan(half), la, lb);
		const rr = d * Math.tan(half);
		const sx = x1 + (ax / la) * d, sy = y1 + (ay / la) * d;
		const ex = x1 + (bx / lb) * d, ey = y1 + (by / lb) * d;
		const bisx = ax / la + bx / lb, bisy = ay / la + by / lb;
		const bl = Math.hypot(bisx, bisy);
		const dist = Math.hypot(d, rr);
		const ccx = x1 + (bisx / bl) * dist, ccy = y1 + (bisy / bl) * dist;
		let a0 = Math.atan2(sy - ccy, sx - ccx);
		let a1 = Math.atan2(ey - ccy, ex - ccx);
		if (cross > 0) {
			if (a1 > a0) a1 -= Math.PI * 2;
		} else if (a1 < a0) a1 += Math.PI * 2;
		if (Math.abs(a1 - a0) > Math.PI) {
			if (a1 > a0) a0 += Math.PI * 2;
			else a1 += Math.PI * 2;
		}
		return this.ellipseArc(ccx, ccy, rr, rr, a0, a1);
	}

	/** A closed axis-aligned rectangle. */
	rect(x: number, y: number, w: number, h: number): this {
		return this.moveTo(x, y).lineTo(x + w, y).lineTo(x + w, y + h).lineTo(x, y + h).close();
	}

	/** A closed rectangle with circular corners. `r` is clamped to half the shorter side. */
	roundRect(x: number, y: number, w: number, h: number, r: number): this {
		r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
		if (r === 0) return this.rect(x, y, w, h);
		const H = Math.PI / 2;
		this.moveTo(x + r, y);
		this.lineTo(x + w - r, y);
		this.ellipseArc(x + w - r, y + r, r, r, -H, 0);
		this.lineTo(x + w, y + h - r);
		this.ellipseArc(x + w - r, y + h - r, r, r, 0, H);
		this.lineTo(x + r, y + h);
		this.ellipseArc(x + r, y + h - r, r, r, H, 2 * H);
		this.lineTo(x, y + r);
		this.ellipseArc(x + r, y + r, r, r, 2 * H, 3 * H);
		return this.close();
	}

	/** A closed ellipse. */
	ellipse(cx: number, cy: number, rx: number, ry: number): this {
		this.#open = false;
		this.ellipseArc(cx, cy, rx, ry, 0, Math.PI * 2);
		return this.close();
	}

	/** A closed circle. */
	circle(cx: number, cy: number, r: number): this {
		return this.ellipse(cx, cy, r, r);
	}

	/** A polyline through `points`, optionally closed. */
	poly(points: ArrayLike<readonly [number, number]>, closed = false): this {
		for (let i = 0; i < points.length; i++) {
			const [x, y] = points[i];
			if (i === 0) this.moveTo(x, y);
			else this.lineTo(x, y);
		}
		if (closed && points.length) this.close();
		return this;
	}

	/** Appends `other`, mapping each point through `x' = x * sx + tx`, `y' = y * sy + ty`. */
	addPath(other: Path, sx = 1, sy = 1, tx = 0, ty = 0): this {
		const c = other.coords;
		let j = 0;
		for (const v of other.verbs) {
			switch (v) {
				case Verb.Move:
					this.moveTo(c[j] * sx + tx, c[j + 1] * sy + ty);
					break;
				case Verb.Line:
					this.lineTo(c[j] * sx + tx, c[j + 1] * sy + ty);
					break;
				case Verb.Quad:
					this.quadTo(c[j] * sx + tx, c[j + 1] * sy + ty, c[j + 2] * sx + tx, c[j + 3] * sy + ty);
					break;
				case Verb.Cubic:
					this.cubicTo(
						c[j] * sx + tx,
						c[j + 1] * sy + ty,
						c[j + 2] * sx + tx,
						c[j + 3] * sy + ty,
						c[j + 4] * sx + tx,
						c[j + 5] * sy + ty,
					);
					break;
				case Verb.Close:
					this.close();
					break;
			}
			j += VERB_ARITY[v];
		}
		return this;
	}

	/** Bounds of every point and control point. Contains the curve; may be a little larger. */
	bounds(): Bounds {
		const c = this.coords;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (let i = 0; i < c.length; i += 2) {
			if (c[i] < minX) minX = c[i];
			if (c[i] > maxX) maxX = c[i];
			if (c[i + 1] < minY) minY = c[i + 1];
			if (c[i + 1] > maxY) maxY = c[i + 1];
		}
		return { minX, minY, maxX, maxY };
	}
}
