/**
 * Appends a triangle fan over a closed contour to `out` (flat `[x, y, …]`, three points per
 * triangle). Correct for convex contours as-is, and for any contour when drawn into a stencil
 * buffer with increment/decrement winding.
 */
export function fanTriangles(pts: number[], out: number[]): void {
	const n = pts.length;
	if (n < 6) return;
	const x0 = pts[0], y0 = pts[1];
	for (let i = 2; i + 3 < n; i += 2) {
		out.push(x0, y0, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
	}
}
