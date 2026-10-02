import type { Bounds, Rect } from "../types.ts";

/**
 * World-to-device mapping used during tessellation: `X = (x - cx) * s + ox`.
 *
 * The subtraction happens first, in float64, so precision is spent on the distance from the
 * camera rather than on absolute world coordinates. `width`/`height` are the device viewport.
 */
export interface Transform {
	cx: number;
	cy: number;
	s: number;
	ox: number;
	oy: number;
	width: number;
	height: number;
	/** Device pixels per CSS pixel, for widths given in screen pixels. */
	pr: number;
}

/** Zoom is clamped here so `2 ** logScale` can never overflow a float64. */
const LOG_SCALE_LIMIT = 1000;

/**
 * A 2D camera. Coordinates on screen are CSS pixels with y pointing down. The zoom is stored as
 * `log2` of pixels-per-world-unit so it never overflows or underflows; what bounds deep zoom in
 * practice is the float64 precision of your own coordinates.
 *
 * The default camera maps world units 1:1 onto screen pixels with the origin at the top-left.
 */
export class Camera {
	/** World x at the center of the viewport. */
	x = 0;
	/** World y at the center of the viewport. */
	y = 0;
	/** `log2` of screen pixels per world unit. */
	logScale = 0;
	/** Viewport width in CSS pixels. */
	width: number;
	/** Viewport height in CSS pixels. */
	height: number;
	/** Device pixels per CSS pixel. */
	pixelRatio: number;
	/** Bumped on every change; lets a render loop skip unchanged frames. */
	version = 0;

	constructor(width: number, height: number, pixelRatio = 1) {
		this.width = width;
		this.height = height;
		this.pixelRatio = pixelRatio;
		this.x = width / 2;
		this.y = height / 2;
	}

	/** Screen pixels per world unit. */
	get scale(): number {
		return 2 ** this.logScale;
	}

	/** Changes the viewport size, keeping the world point at the top-left fixed. */
	resize(width: number, height: number, pixelRatio = this.pixelRatio): void {
		const s = this.scale;
		this.x += (width - this.width) / 2 / s;
		this.y += (height - this.height) / 2 / s;
		this.width = width;
		this.height = height;
		this.pixelRatio = pixelRatio;
		this.version++;
	}

	/** World coordinates to screen CSS pixels. */
	worldToScreen(x: number, y: number): [number, number] {
		const s = this.scale;
		return [(x - this.x) * s + this.width / 2, (y - this.y) * s + this.height / 2];
	}

	/**
	 * A world rectangle in screen CSS pixels relative to the canvas: where to put an HTML element
	 * so it covers exactly that rectangle at the current pan and zoom.
	 */
	rectToScreen(r: Rect): Rect {
		const [x, y] = this.worldToScreen(r.x, r.y);
		const s = this.scale;
		return { x, y, w: r.w * s, h: r.h * s };
	}

	/** Screen CSS pixels to world coordinates. */
	screenToWorld(sx: number, sy: number): [number, number] {
		const s = this.scale;
		return [(sx - this.width / 2) / s + this.x, (sy - this.height / 2) / s + this.y];
	}

	/** Moves the view by a screen-pixel delta, as if dragging the world with the pointer. */
	pan(dx: number, dy: number): void {
		const s = this.scale;
		this.x -= dx / s;
		this.y -= dy / s;
		this.version++;
	}

	/** Multiplies the zoom by `factor`, keeping the world point under the screen point fixed. */
	zoomAt(sx: number, sy: number, factor: number): void {
		const [wx, wy] = this.screenToWorld(sx, sy);
		this.setLogScale(this.logScale + Math.log2(factor));
		const [nx, ny] = this.screenToWorld(sx, sy);
		this.x += wx - nx;
		this.y += wy - ny;
		this.version++;
	}

	/** Sets the zoom directly. Clamped to keep `scale` finite. */
	setLogScale(logScale: number): void {
		this.logScale = Math.max(-LOG_SCALE_LIMIT, Math.min(LOG_SCALE_LIMIT, logScale));
		this.version++;
	}

	/** Centers and zooms so `bounds` fills the viewport, leaving `padding` screen pixels around it. */
	fit(bounds: Bounds, padding = 16): void {
		const w = Math.max(bounds.maxX - bounds.minX, Number.MIN_VALUE);
		const h = Math.max(bounds.maxY - bounds.minY, Number.MIN_VALUE);
		const availW = Math.max(1, this.width - padding * 2);
		const availH = Math.max(1, this.height - padding * 2);
		this.setLogScale(Math.log2(Math.min(availW / w, availH / h)));
		this.x = (bounds.minX + bounds.maxX) / 2;
		this.y = (bounds.minY + bounds.maxY) / 2;
		this.version++;
	}

	/** The world region currently visible. */
	visibleBounds(): Bounds {
		const [minX, minY] = this.screenToWorld(0, 0);
		const [maxX, maxY] = this.screenToWorld(this.width, this.height);
		return { minX, minY, maxX, maxY };
	}

	/** The world-to-device transform for tessellation. */
	transform(): Transform {
		const r = this.pixelRatio;
		return {
			cx: this.x,
			cy: this.y,
			s: this.scale * r,
			ox: (this.width * r) / 2,
			oy: (this.height * r) / 2,
			width: Math.max(1, Math.round(this.width * r)),
			height: Math.max(1, Math.round(this.height * r)),
			pr: r,
		};
	}
}
