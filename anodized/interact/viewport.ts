import type { ViewportOptions } from "../types.ts";
import type { Camera } from "../core/camera.ts";
import { Buttons, type InputState } from "./input.ts";

/** Wheel zoom around the cursor and drag-to-pan. Opt-in. */
export class ViewportController {
	wheelZoom: boolean;
	/** Buttons that pan when dragged, as `MouseEvent.buttons` bits. */
	panButtons: number;
	wheel: "zoom" | "pan";
	minZoom: number;
	maxZoom: number;
	/** Zoom factor per pixel of wheel delta, as a power of two. */
	zoomSpeed = 0.002;
	/** The button bit driving the current pan, or 0. */
	#panning = 0;

	constructor(opts: ViewportOptions = {}) {
		this.wheelZoom = opts.wheelZoom ?? true;
		this.panButtons = opts.dragPan === false ? 0 : opts.panButtons ?? Buttons.primary;
		this.wheel = opts.wheel ?? "zoom";
		this.minZoom = opts.minZoom ?? 0;
		this.maxZoom = opts.maxZoom ?? Infinity;
	}

	/** `true` while dragging with the primary button pans. Kept for compatibility. */
	get dragPan(): boolean {
		return (this.panButtons & Buttons.primary) !== 0;
	}

	set dragPan(on: boolean) {
		this.panButtons = on ? this.panButtons | Buttons.primary : this.panButtons & ~Buttons.primary;
	}

	/** `true` while a pan drag is in progress. */
	get panning(): boolean {
		return this.#panning !== 0;
	}

	/** Applies one frame of input. `overObject` blocks starting a primary-button pan on top of something. */
	update(input: InputState, camera: Camera, overObject: boolean): void {
		if (input.inside && (input.wheel !== 0 || input.wheelX !== 0)) {
			if (this.wheel === "pan" && !input.wheelZoom) {
				camera.pan(-input.wheelX, -input.wheel);
			} else if (this.wheelZoom && input.wheel !== 0) {
				this.#zoom(camera, input.x, input.y, 2 ** (-input.wheel * this.zoomSpeed));
			}
		}
		if (!this.#panning) {
			for (const bit of [Buttons.middle, Buttons.secondary, Buttons.primary]) {
				if (!(input.pressedButtons & bit & this.panButtons)) continue;
				if (bit === Buttons.primary && overObject) continue;
				this.#panning = bit;
				break;
			}
		}
		if (this.#panning && (input.buttons & this.#panning) && (input.dx || input.dy)) {
			camera.pan(input.dx, input.dy);
		}
		if (!(input.buttons & this.#panning)) this.#panning = 0;
	}

	/** Zooms around a screen point, clamped to the allowed range. */
	#zoom(camera: Camera, sx: number, sy: number, factor: number): void {
		const target = Math.min(this.maxZoom, Math.max(this.minZoom, camera.scale * factor));
		if (target !== camera.scale) camera.zoomAt(sx, sy, target / camera.scale);
	}

	/** Brings the camera back inside the allowed zoom range, e.g. after the limits change. */
	clamp(camera: Camera): void {
		this.#zoom(camera, camera.width / 2, camera.height / 2, 1);
	}
}
