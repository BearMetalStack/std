import type { ImageSmoothing, ImageSource, RGBA } from "../types.ts";

/**
 * Floats per vertex: `x, y` in device pixels, premultiplied `r, g, b, a`, then `u, v` image
 * coordinates (unused by color fills).
 */
export const VERTEX_FLOATS = 8;

/** The image a draw samples; its color multiplies the texels. */
export interface ImageDraw {
	source: ImageSource;
	smoothing: ImageSmoothing;
}

/**
 * One draw in painter's order.
 * - `convex`: triangles drawn straight to color.
 * - `nonzero` / `evenodd` / `union`: triangles `[first, first + count)` go to the stencil only,
 *   then the cover quad `[coverFirst, coverFirst + coverCount)` paints where the stencil is set
 *   and clears it behind itself.
 */
export interface DrawItem {
	kind: "convex" | "nonzero" | "evenodd" | "union";
	first: number;
	count: number;
	coverFirst: number;
	coverCount: number;
	/** Paint the color pass with this image instead of a flat color. */
	image?: ImageDraw;
}

/** A tessellated frame, ready to upload. */
export interface Geometry {
	vertices: Float32Array;
	vertexCount: number;
	items: DrawItem[];
}

/** A canvas the backend presents frames into. */
export interface Surface {
	render(geometry: Geometry, width: number, height: number, clear: RGBA): void;
}

/** An offscreen render target whose pixels can be read back. */
export interface Offscreen {
	readonly width: number;
	readonly height: number;
	render(geometry: Geometry, clear: RGBA): void;
	/** RGBA, straight alpha, tightly packed rows. */
	read(): Promise<Uint8Array>;
	destroy(): void;
}

/**
 * What a renderer has to provide. WebGPU is the only implementation today; the interface is the
 * seam a WebGL2 fallback would plug into.
 */
export interface Backend {
	/** Largest texture side this device supports. */
	readonly maxTextureSize: number;
	createSurface(canvas: HTMLCanvasElement | OffscreenCanvas): Surface;
	createOffscreen(width: number, height: number): Offscreen;
	/** Like {@linkcode createOffscreen}, but resolves `null` when the device cannot allocate it. */
	tryCreateOffscreen(width: number, height: number): Promise<Offscreen | null>;
	/** Frees the GPU copy of an image; it is uploaded again if drawn later. */
	releaseImage(source: ImageSource): void;
	destroy(): void;
}
