import type { Bounds, RGBA } from "../types.ts";
import type { Transform } from "./camera.ts";
import type { DrawCommand } from "./commands.ts";
import { type DrawItem, type Geometry, VERTEX_FLOATS } from "../gpu/backend.ts";
import { flattenPath, TOLERANCE } from "../geometry/flatten.ts";
import { clipPolygon, clipPolyline, containsBounds, pointBounds } from "../geometry/clip.ts";
import { fanTriangles } from "../geometry/fill.ts";
import { dashPolyline } from "../geometry/dash.ts";
import { strokePolyline } from "../geometry/stroke.ts";

class GeometryBuilder {
	data = new Float32Array(VERTEX_FLOATS * 4096);
	count = 0;
	items: DrawItem[] = [];

	#reserve(n: number): void {
		const need = (this.count + n) * VERTEX_FLOATS;
		if (need <= this.data.length) return;
		let size = this.data.length * 2;
		while (size < need) size *= 2;
		const next = new Float32Array(size);
		next.set(this.data.subarray(0, this.count * VERTEX_FLOATS));
		this.data = next;
	}

	/** Appends flat `[x, y, …]` triangle points with one color; returns the first vertex. */
	triangles(tris: number[], c: RGBA): number {
		const n = tris.length / 2;
		this.#reserve(n);
		const first = this.count;
		const r = c[0] * c[3], g = c[1] * c[3], b = c[2] * c[3], a = c[3];
		let o = this.count * VERTEX_FLOATS;
		const d = this.data;
		for (let i = 0; i < tris.length; i += 2) {
			d[o] = tris[i];
			d[o + 1] = tris[i + 1];
			d[o + 2] = r;
			d[o + 3] = g;
			d[o + 4] = b;
			d[o + 5] = a;
			o += VERTEX_FLOATS;
		}
		this.count += n;
		return first;
	}

	convex(tris: number[], c: RGBA): void {
		if (!tris.length) return;
		const first = this.triangles(tris, c);
		const count = tris.length / 2;
		const prev = this.items[this.items.length - 1];
		if (prev && prev.kind === "convex" && prev.first + prev.count === first) {
			prev.count += count;
		} else {
			this.items.push({ kind: "convex", first, count, coverFirst: 0, coverCount: 0 });
		}
	}

	stencil(kind: "nonzero" | "evenodd" | "union", tris: number[], c: RGBA, b: Bounds): void {
		if (!tris.length || b.minX >= b.maxX || b.minY >= b.maxY) return;
		const first = this.triangles(tris, c);
		const cover = [
			b.minX,
			b.minY,
			b.maxX,
			b.minY,
			b.maxX,
			b.maxY,
			b.minX,
			b.minY,
			b.maxX,
			b.maxY,
			b.minX,
			b.maxY,
		];
		const coverFirst = this.triangles(cover, c);
		this.items.push({ kind, first, count: tris.length / 2, coverFirst, coverCount: 6 });
	}

	finish(): Geometry {
		return { vertices: this.data, vertexCount: this.count, items: this.items };
	}
}

function grow(b: Bounds, d: number): Bounds {
	return { minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d };
}

function intersect(a: Bounds, b: Bounds): Bounds {
	return {
		minX: Math.max(a.minX, b.minX),
		minY: Math.max(a.minY, b.minY),
		maxX: Math.min(a.maxX, b.maxX),
		maxY: Math.min(a.maxY, b.maxY),
	};
}

/** Device-pixel half-width of a command's stroke under transform `t`. */
export function strokeHalfWidth(cmd: DrawCommand, t: Transform): number {
	const s = cmd.style;
	if (!s.stroke) return 0;
	return (s.strokeWidth * (s.scaleWidth ? t.s : t.pr)) / 2;
}

/**
 * Turns recorded commands into GPU geometry for one viewport. Everything is computed in device
 * pixels relative to the camera, and clipped to the viewport before narrowing to float32.
 */
export function tessellate(cmds: Iterable<DrawCommand>, t: Transform, tol = TOLERANCE): Geometry {
	const g = new GeometryBuilder();
	const view: Bounds = { minX: 0, minY: 0, maxX: t.width, maxY: t.height };
	const fillView = grow(view, 1);

	for (const cmd of cmds) {
		const s = cmd.style;
		if (!s.fill && !s.stroke) continue;
		const hw = strokeHalfWidth(cmd, t);
		const reach = hw * Math.max(s.miterLimit, Math.SQRT2) + 2;
		const b = cmd.bounds;
		const db: Bounds = {
			minX: (b.minX - t.cx) * t.s + t.ox - reach,
			minY: (b.minY - t.cy) * t.s + t.oy - reach,
			maxX: (b.maxX - t.cx) * t.s + t.ox + reach,
			maxY: (b.maxY - t.cy) * t.s + t.oy + reach,
		};
		if (db.maxX < 0 || db.minX > t.width || db.maxY < 0 || db.minY > t.height) continue;

		const strokeView = grow(view, reach);
		const polys = flattenPath(cmd.path, t, s.stroke ? strokeView : fillView, tol);
		if (!polys.length) continue;

		if (s.fill) {
			const tris: number[] = [];
			const clipped = polys.map((p) => clipPolygon(p.pts, fillView)).filter((p) => p.length >= 6);
			for (const p of clipped) fanTriangles(p, tris);
			if (cmd.convex && clipped.length === 1) g.convex(tris, s.fill);
			else if (tris.length) {
				g.stencil(s.fillRule, tris, s.fill, intersect(pointBounds(tris), view));
			}
		}

		if (s.stroke && hw > 0) {
			const unit = s.scaleWidth ? t.s : t.pr;
			const params = { halfWidth: hw, join: s.join, cap: s.cap, miterLimit: s.miterLimit, tol };
			const tris: number[] = [];
			for (const p of polys) {
				for (const piece of strokePieces(p.pts, p.closed, s.dash, s.dashOffset, unit, strokeView)) {
					strokePolyline(piece.pts, piece.closed, params, tris);
				}
			}
			if (tris.length) g.stencil("union", tris, s.stroke, intersect(pointBounds(tris), view));
		}
	}
	return g.finish();
}

function strokePieces(
	pts: number[],
	closed: boolean,
	dash: readonly number[] | null,
	dashOffset: number,
	unit: number,
	view: Bounds,
): { pts: number[]; closed: boolean }[] {
	const loop = closed ? [...pts, pts[0], pts[1]] : pts;
	if (dash) {
		return dashPolyline(loop, dash.map((d) => d * unit), dashOffset * unit, view)
			.map((p) => ({ pts: p, closed: false }));
	}
	if (containsBounds(view, pointBounds(pts))) return [{ pts, closed }];
	const pieces = clipPolyline(loop, view);
	if (closed && pieces.length > 1) {
		const a = pieces[0], z = pieces[pieces.length - 1];
		if (
			a[0] === loop[0] && a[1] === loop[1] && z[z.length - 2] === loop[0] &&
			z[z.length - 1] === loop[1]
		) {
			pieces[0] = [...z, ...a.slice(2)];
			pieces.pop();
		}
	}
	return pieces.map((p) => ({ pts: p, closed: false }));
}
