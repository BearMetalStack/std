import type { ViewportOptions } from "../types.ts";
import type { Camera } from "../core/camera.ts";
import type { InputState } from "./input.ts";

/** Wheel zoom around the cursor and drag-to-pan on empty space. Opt-in. */
export class ViewportController {
	wheelZoom: boolean;
	dragPan: boolean;
	/** Zoom factor per pixel of wheel delta, as a power of two. */
	zoomSpeed = 0.002;
	#panning = false;

	constructor(opts: ViewportOptions = {}) {
		this.wheelZoom = opts.wheelZoom ?? true;
		this.dragPan = opts.dragPan ?? true;
	}

	/** `true` while a pan drag is in progress. */
	get panning(): boolean {
		return this.#panning;
	}

	/** Applies one frame of input. `overObject` blocks starting a pan on top of something. */
	update(input: InputState, camera: Camera, overObject: boolean): void {
		if (this.wheelZoom && input.wheel !== 0 && input.inside) {
			camera.zoomAt(input.x, input.y, 2 ** (-input.wheel * this.zoomSpeed));
		}
		if (this.dragPan) {
			if (input.pressed && !overObject) this.#panning = true;
			if (this.#panning && input.down && (input.dx || input.dy)) camera.pan(input.dx, input.dy);
		}
		if (!input.down) this.#panning = false;
	}
}
