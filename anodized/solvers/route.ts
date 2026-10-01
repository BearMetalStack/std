import type { Point, Port, Rect, RouteKind } from "../types.ts";
import { Path } from "../geometry/path.ts";
import {
	autoPorts,
	center,
	type NodeGeometry,
	perimeterPoint,
	PORT_NORMALS,
	portPoint,
} from "./anchors.ts";

/** A solved connector route. */
export type Route =
	| { kind: "poly"; points: Point[] }
	| { kind: "cubic"; points: [Point, Point, Point, Point] };

/** Inputs to {@linkcode solveRoute}. */
export interface RouteRequest {
	from: NodeGeometry;
	to: NodeGeometry;
	kind: RouteKind;
	fromPort?: Port;
	toPort?: Port;
	/** Where along the source side to attach, `0..1`. Default `0.5`. */
	fromAt?: number;
	/** Where along the target side to attach, `0..1`. Default `0.5`. */
	toAt?: number;
	/** Distance orthogonal routes keep from obstacles. */
	margin: number;
	/** Rectangles orthogonal routes avoid. May include `from` and `to`. */
	obstacles: readonly Rect[];
}

/** Routes a connector between two nodes. */
export function solveRoute(req: RouteRequest): Route {
	const { from, to } = req;
	if (req.kind === "straight") {
		const a = req.fromPort && req.fromPort !== "center"
			? portPoint(from, req.fromPort)
			: perimeterPoint(from, ...(req.toPort ? portPoint(to, req.toPort) : center(to.rect)));
		const b = req.toPort && req.toPort !== "center"
			? portPoint(to, req.toPort)
			: perimeterPoint(to, ...a);
		return { kind: "poly", points: [a, b] };
	}
	const [fp, tp] = resolvePorts(from.rect, to.rect, req.fromPort, req.toPort);
	const a = portPoint(from, fp, req.fromAt), b = portPoint(to, tp, req.toAt);
	const na = PORT_NORMALS[fp], nb = PORT_NORMALS[tp];
	if (req.kind === "bezier") {
		const d = Math.max(30, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.4);
		return {
			kind: "cubic",
			points: [a, [a[0] + na[0] * d, a[1] + na[1] * d], [b[0] + nb[0] * d, b[1] + nb[1] * d], b],
		};
	}
	return { kind: "poly", points: orthogonal(a, na, b, nb, req.margin, req.obstacles) };
}

/** The sides a non-straight route uses: explicit ports win, `center` and gaps are picked automatically. */
export function resolvePorts(
	from: Rect,
	to: Rect,
	fromPort?: Port,
	toPort?: Port,
): [Exclude<Port, "center">, Exclude<Port, "center">] {
	const [autoFrom, autoTo] = autoPorts(from, to);
	const fp = fromPort && fromPort !== "center" ? fromPort : autoFrom;
	const tp = toPort && toPort !== "center" ? toPort : autoTo;
	return [fp as Exclude<Port, "center">, tp as Exclude<Port, "center">];
}

const DIRS: Point[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function dirIndex(n: Point): number {
	return DIRS.findIndex((d) => d[0] === n[0] && d[1] === n[1]);
}

/**
 * Orthogonal routing: A* over a sparse grid whose lines sit `margin` outside every obstacle, with
 * a bend penalty so routes prefer fewer turns before shorter length. Routes never cross an
 * obstacle; the margin is kept wherever the layout leaves room for it.
 */
export function orthogonal(
	a: Point,
	na: Point,
	b: Point,
	nb: Point,
	margin: number,
	obstacles: readonly Rect[],
): Point[] {
	const m = Math.max(margin, 1e-6);
	const s: Point = [a[0] + na[0] * m, a[1] + na[1] * m];
	const e: Point = [b[0] + nb[0] * m, b[1] + nb[1] * m];
	const eps = 1e-9 * (1 + m);
	const boxes = obstacles.map((r) => ({
		minX: r.x + eps,
		minY: r.y + eps,
		maxX: r.x + r.w - eps,
		maxY: r.y + r.h - eps,
	}));
	const blocked = (x: number, y: number) =>
		boxes.some((o) => x > o.minX && x < o.maxX && y > o.minY && y < o.maxY);
	const crosses = (x0: number, y0: number, x1: number, y1: number) =>
		boxes.some((o) =>
			Math.max(x0, x1) > o.minX && Math.min(x0, x1) < o.maxX && Math.max(y0, y1) > o.minY &&
			Math.min(y0, y1) < o.maxY
		);

	const xsSet = new Set([s[0], e[0], (s[0] + e[0]) / 2]);
	const ysSet = new Set([s[1], e[1], (s[1] + e[1]) / 2]);
	for (const r of obstacles) {
		xsSet.add(r.x - m).add(r.x + r.w + m);
		ysSet.add(r.y - m).add(r.y + r.h + m);
	}
	const xs = [...xsSet].sort((p, q) => p - q);
	const ys = [...ysSet].sort((p, q) => p - q);
	const W = xs.length, H = ys.length;
	const free = new Uint8Array(W * H);
	for (let j = 0; j < H; j++) {
		for (let i = 0; i < W; i++) free[j * W + i] = blocked(xs[i], ys[j]) ? 0 : 1;
	}
	const si = xs.indexOf(s[0]), sj = ys.indexOf(s[1]);
	const ei = xs.indexOf(e[0]), ej = ys.indexOf(e[1]);
	free[sj * W + si] = 1;
	free[ej * W + ei] = 1;

	const bend = m * 4;
	const startDir = dirIndex(na);
	const endDir = dirIndex([-nb[0], -nb[1]]);
	const key = (i: number, j: number, d: number) => ((j * W + i) << 2) | d;
	const g = new Map<number, number>();
	const prev = new Map<number, number>();
	const heap = new MinHeap();
	const h = (i: number, j: number) => Math.abs(xs[i] - e[0]) + Math.abs(ys[j] - e[1]);
	const k0 = key(si, sj, startDir);
	g.set(k0, 0);
	heap.push(h(si, sj), k0);

	let best = -1, bestCost = Infinity;
	while (heap.size) {
		const [f, k] = heap.pop();
		if (f >= bestCost) break;
		const cost = g.get(k)!;
		const d = k & 3, cell = k >> 2;
		const i = cell % W, j = (cell / W) | 0;
		if (i === ei && j === ej) {
			const total = cost + (d !== endDir ? bend : 0);
			if (total < bestCost) {
				bestCost = total;
				best = k;
			}
			continue;
		}
		for (let nd = 0; nd < 4; nd++) {
			if (((nd + 2) & 3) === d) continue;
			const ni = i + DIRS[nd][0], nj = j + DIRS[nd][1];
			if (ni < 0 || nj < 0 || ni >= W || nj >= H || !free[nj * W + ni]) continue;
			if (crosses(xs[i], ys[j], xs[ni], ys[nj])) continue;
			const step = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]);
			const nc = cost + step + (nd !== d ? bend : 0);
			const nk = key(ni, nj, nd);
			if (nc < (g.get(nk) ?? Infinity)) {
				g.set(nk, nc);
				prev.set(nk, k);
				heap.push(nc + h(ni, nj), nk);
			}
		}
	}

	let mid: Point[];
	if (best < 0) {
		const mx = (s[0] + e[0]) / 2;
		mid = [s, [mx, s[1]], [mx, e[1]], e];
	} else {
		mid = [];
		for (let k: number | undefined = best; k !== undefined; k = prev.get(k)) {
			const cell = k >> 2;
			mid.push([xs[cell % W], ys[(cell / W) | 0]]);
		}
		mid.reverse();
	}
	return centerJog(simplify([a, ...mid, b]), crosses);
}

/** Moves the middle leg of a Z-shaped route halfway between its ends, when that is free. */
function centerJog(
	p: Point[],
	crosses: (x0: number, y0: number, x1: number, y1: number) => boolean,
): Point[] {
	if (p.length !== 4) return p;
	const [a, p1, p2, b] = p;
	const vertical = a[0] === p1[0] && p2[0] === b[0] && p1[1] === p2[1] &&
		Math.sign(p1[1] - a[1]) === Math.sign(b[1] - p2[1]);
	const horizontal = a[1] === p1[1] && p2[1] === b[1] && p1[0] === p2[0] &&
		Math.sign(p1[0] - a[0]) === Math.sign(b[0] - p2[0]);
	let q: Point[] | null = null;
	if (vertical) {
		const m = (a[1] + b[1]) / 2;
		q = [a, [a[0], m], [b[0], m], b];
	} else if (horizontal) {
		const m = (a[0] + b[0]) / 2;
		q = [a, [m, a[1]], [m, b[1]], b];
	}
	if (!q) return p;
	for (let i = 1; i < q.length; i++) {
		if (crosses(q[i - 1][0], q[i - 1][1], q[i][0], q[i][1])) return p;
	}
	return q;
}

/** Drops repeated and collinear points from an axis-aligned polyline. */
export function simplify(pts: Point[]): Point[] {
	const out: Point[] = [];
	for (const p of pts) {
		const l = out[out.length - 1];
		if (l && Math.abs(l[0] - p[0]) < 1e-9 && Math.abs(l[1] - p[1]) < 1e-9) continue;
		if (out.length >= 2) {
			const k = out[out.length - 2];
			const cross = (l[0] - k[0]) * (p[1] - l[1]) - (l[1] - k[1]) * (p[0] - l[0]);
			const dot = (l[0] - k[0]) * (p[0] - l[0]) + (l[1] - k[1]) * (p[1] - l[1]);
			if (Math.abs(cross) < 1e-9 && dot >= 0) out.pop();
		}
		out.push(p);
	}
	return out;
}

/** Number of direction changes in a polyline. */
export function countBends(pts: readonly Point[]): number {
	return Math.max(0, simplify([...pts]).length - 2);
}

/**
 * Shortens a route by `start`/`end` world units at either end (to make room for arrowheads) and
 * returns it together with the direction of travel at each end.
 */
export function trimRoute(route: Route, start: number, end: number): {
	route: Route;
	startDir: Point;
	endDir: Point;
} {
	const p = route.points.map((q) => [q[0], q[1]] as [number, number]);
	const n = p.length;
	const dir = (from: Point, to: Point): Point => {
		const l = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
		return [(to[0] - from[0]) / l, (to[1] - from[1]) / l];
	};
	const firstOther = p.find((q) => q[0] !== p[0][0] || q[1] !== p[0][1]) ?? p[n - 1];
	const lastOther = [...p].reverse().find((q) => q[0] !== p[n - 1][0] || q[1] !== p[n - 1][1]) ??
		p[0];
	const startDir = dir(firstOther, p[0]);
	const endDir = dir(lastOther, p[n - 1]);
	const shift = (i: number, j: number, d: number) => {
		const l = Math.hypot(p[j][0] - p[i][0], p[j][1] - p[i][1]);
		const t = l > 0 ? Math.min(d, l * 0.9) / l : 0;
		const dx = (p[j][0] - p[i][0]) * t, dy = (p[j][1] - p[i][1]) * t;
		p[i][0] += dx;
		p[i][1] += dy;
		if (route.kind === "cubic") {
			const c = i === 0 ? 1 : n - 2;
			p[c][0] += dx;
			p[c][1] += dy;
		}
	};
	if (start > 0) shift(0, 1, start);
	if (end > 0) shift(n - 1, n - 2, end);
	return {
		route: route.kind === "cubic"
			? { kind: "cubic", points: p as unknown as [Point, Point, Point, Point] }
			: { kind: "poly", points: p },
		startDir,
		endDir,
	};
}

/** A route as a path, with orthogonal corners rounded by `radius`. */
export function routePath(route: Route, radius = 0): Path {
	const p = route.points;
	const path = new Path().moveTo(p[0][0], p[0][1]);
	if (route.kind === "cubic") {
		return path.cubicTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
	}
	for (let i = 1; i < p.length; i++) {
		if (radius > 0 && i < p.length - 1) {
			const r = Math.min(
				radius,
				Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) / 2,
				Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) / 2,
			);
			path.arcTo(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], r);
		} else path.lineTo(p[i][0], p[i][1]);
	}
	return path;
}

/** The point halfway along a route, by length. */
export function routeMidpoint(route: Route): Point {
	let pts: Point[] = route.points;
	if (route.kind === "cubic") {
		const [a, b, c, d] = route.points;
		pts = [];
		for (let i = 0; i <= 32; i++) {
			const t = i / 32, u = 1 - t;
			pts.push([
				u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
				u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
			]);
		}
	}
	const lens: number[] = [];
	let total = 0;
	for (let i = 1; i < pts.length; i++) {
		const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
		lens.push(l);
		total += l;
	}
	let half = total / 2;
	for (let i = 0; i < lens.length; i++) {
		if (half <= lens[i] && lens[i] > 0) {
			const t = half / lens[i];
			return [
				pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
				pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
			];
		}
		half -= lens[i];
	}
	return pts[pts.length - 1];
}

class MinHeap {
	#f: number[] = [];
	#k: number[] = [];

	get size(): number {
		return this.#f.length;
	}

	push(f: number, k: number): void {
		const F = this.#f, K = this.#k;
		let i = F.length;
		F.push(f);
		K.push(k);
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (F[p] <= F[i]) break;
			[F[p], F[i]] = [F[i], F[p]];
			[K[p], K[i]] = [K[i], K[p]];
			i = p;
		}
	}

	pop(): [number, number] {
		const F = this.#f, K = this.#k;
		const top: [number, number] = [F[0], K[0]];
		const lf = F.pop()!, lk = K.pop()!;
		if (F.length) {
			F[0] = lf;
			K[0] = lk;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1, r = l + 1;
				let m = i;
				if (l < F.length && F[l] < F[m]) m = l;
				if (r < F.length && F[r] < F[m]) m = r;
				if (m === i) break;
				[F[m], F[i]] = [F[i], F[m]];
				[K[m], K[i]] = [K[i], K[m]];
				i = m;
			}
		}
		return top;
	}
}
