/** Pointer state for one frame, in CSS pixels relative to the canvas. */
export interface InputState {
	x: number;
	y: number;
	/** Movement since the previous frame. */
	dx: number;
	dy: number;
	inside: boolean;
	/** Primary button is held. */
	down: boolean;
	/** Primary button went down this frame. */
	pressed: boolean;
	/** Primary button went up this frame. */
	released: boolean;
	/** Accumulated wheel delta (positive scrolls down / zooms out). */
	wheel: number;
}

/** A press and release of one button that stayed within {@linkcode PointerInput.clickSlop}. */
export interface PointerClick {
	button: number;
	/** Release position in CSS pixels relative to the canvas. */
	x: number;
	y: number;
}

/**
 * Collects DOM pointer and wheel events into per-frame {@linkcode InputState} snapshots, and
 * reports clicks (any button) the moment they are released.
 */
export class PointerInput {
	#x = 0;
	#y = 0;
	#lastX = 0;
	#lastY = 0;
	#inside = false;
	#down = false;
	#pressed = false;
	#released = false;
	#wheel = 0;
	/** `true` when an event arrived since the last {@linkcode consume}. */
	pending = false;
	/** Called on every event; a render loop uses it to wake up. */
	onChange?: () => void;
	/** Called when a button is released without the pointer having been dragged. */
	onClick?: (click: PointerClick) => void;
	/** How far, in CSS pixels, a press may wander before it counts as a drag. Default `4`. */
	clickSlop = 4;
	#presses = new Map<number, { x: number; y: number; moved: boolean }>();

	/** Starts listening on `el`. Returns a function that stops. */
	attach(el: HTMLElement): () => void {
		const pos = (e: PointerEvent | WheelEvent) => {
			const r = el.getBoundingClientRect();
			this.#x = e.clientX - r.left;
			this.#y = e.clientY - r.top;
		};
		const changed = () => {
			this.pending = true;
			this.onChange?.();
		};
		const move = (e: PointerEvent) => {
			pos(e);
			this.#inside = true;
			for (const p of this.#presses.values()) {
				if (Math.hypot(this.#x - p.x, this.#y - p.y) > this.clickSlop) p.moved = true;
			}
			changed();
		};
		const down = (e: PointerEvent) => {
			pos(e);
			this.#presses.set(e.button, { x: this.#x, y: this.#y, moved: false });
			if (e.button !== 0) return;
			el.setPointerCapture?.(e.pointerId);
			this.#down = true;
			this.#pressed = true;
			changed();
		};
		const up = (e: PointerEvent) => {
			pos(e);
			if (e.type === "pointercancel") this.#presses.clear();
			else {
				const press = this.#presses.get(e.button);
				this.#presses.delete(e.button);
				if (
					press && !press.moved &&
					Math.hypot(this.#x - press.x, this.#y - press.y) <= this.clickSlop
				) {
					this.onClick?.({ button: e.button, x: this.#x, y: this.#y });
				}
			}
			if (e.button !== 0 && e.type !== "pointercancel") return;
			if (this.#down) this.#released = true;
			this.#down = false;
			changed();
		};
		const leave = () => {
			this.#inside = false;
			changed();
		};
		const wheel = (e: WheelEvent) => {
			e.preventDefault();
			pos(e);
			const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
			this.#wheel += e.deltaY * k;
			changed();
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerdown", down);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", up);
		el.addEventListener("pointerleave", leave);
		el.addEventListener("wheel", wheel, { passive: false });
		return () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerdown", down);
			el.removeEventListener("pointerup", up);
			el.removeEventListener("pointercancel", up);
			el.removeEventListener("pointerleave", leave);
			el.removeEventListener("wheel", wheel);
		};
	}

	/** Returns this frame's state and resets the one-frame edges. */
	consume(): InputState {
		const s: InputState = {
			x: this.#x,
			y: this.#y,
			dx: this.#x - this.#lastX,
			dy: this.#y - this.#lastY,
			inside: this.#inside,
			down: this.#down,
			pressed: this.#pressed,
			released: this.#released,
			wheel: this.#wheel,
		};
		this.#lastX = this.#x;
		this.#lastY = this.#y;
		this.#pressed = this.#released = false;
		this.#wheel = 0;
		this.pending = false;
		return s;
	}
}
