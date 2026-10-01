import type { Bounds, DotGridOptions } from "../types.ts";
import { Path } from "../geometry/path.ts";

/** Defaults for {@linkcode DotGridOptions}. */
export const DOT_GRID_DEFAULTS = { size: 2, spacing: 20, color: "#cbd5e1" } as const;

/** Dots never get closer than this on screen; the grid thins out instead. */
const MIN_GAP_PX = 8;
const MAX_DOTS = 40_000;

/**
 * The spacing actually drawn at `scale` screen pixels per world unit: the requested spacing,
 * doubled until dots are at least {@linkcode MIN_GAP_PX} apart and the view holds at most
 * {@linkcode MAX_DOTS}. Doubling keeps every drawn dot on the requested lattice.
 */
export function effectiveSpacing(spacing: number, scale: number, bounds: Bounds): number {
	let s = spacing;
	const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY;
	while (s * scale < MIN_GAP_PX || (w / s + 1) * (h / s + 1) > MAX_DOTS) {
		s *= 2;
		if (!Number.isFinite(s)) break;
	}
	return s;
}

/** Dots covering `bounds`, sized `size` screen pixels across at `scale`. */
export function dotGridPath(o: DotGridOptions, bounds: Bounds, scale: number): Path {
	const size = o.size ?? DOT_GRID_DEFAULTS.size;
	const spacing = o.spacing ?? DOT_GRID_DEFAULTS.spacing;
	const path = new Path();
	if (!(size > 0) || !(spacing > 0) || !(scale > 0)) return path;
	const s = effectiveSpacing(spacing, scale, bounds);
	const r = size / 2 / scale;
	const i0 = Math.ceil((bounds.minX - r) / s), i1 = Math.floor((bounds.maxX + r) / s);
	const j0 = Math.ceil((bounds.minY - r) / s), j1 = Math.floor((bounds.maxY + r) / s);
	for (let j = j0; j <= j1; j++) {
		for (let i = i0; i <= i1; i++) path.circle(i * s, j * s, r);
	}
	return path;
}
