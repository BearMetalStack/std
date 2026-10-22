import type { Modifiers } from "../types.ts";

/** Bits of {@linkcode InputState.buttons}, matching `MouseEvent.buttons`. */
export const Buttons = { primary: 1, secondary: 2, middle: 4 } as const;

/** The `MouseEvent.buttons` bit for a `MouseEvent.button` number. */
export function buttonBit(button: number): number {
	return button === 1 ? 4 : button === 2 ? 2 : 1 << button;
}

/** Pointer state for one frame, in CSS pixels relative to the canvas. */
export interface InputState extends Modifiers {
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
	/** Every held button, as `MouseEvent.buttons` bits (see {@linkcode Buttons}). */
	buttons: number;
	/** Buttons that went down this frame, as bits. */
	pressedButtons: number;
	/** Buttons that went up this frame, as bits. */
	releasedButtons: number;
	/** Accumulated vertical wheel delta (positive scrolls down / zooms out). */
	wheel: number;
	/** Accumulated horizontal wheel delta (positive scrolls right). */
	wheelX: number;
	/**
	 * Ctrl or Meta was held during the wheel input. Browsers report trackpad pinches as wheel
	 * events with Ctrl set.
	 */
	wheelZoom: boolean;
}

/** A press and release of one button that stayed within {@linkcode PointerInput.clickSlop}. */
export interface PointerClick extends Modifiers {
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
	#wheelX = 0;
	#wheelZoom = false;
	#buttons = 0;
	#pressedButtons = 0;
	#releasedButtons = 0;
	#mods: Modifiers = { shift: false, ctrl: false, alt: false, meta: false };
	/** When `false`, right-clicks on the element don't open the browser's context menu. */
	contextMenu = true;
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
			this.#mods = modifiers(e);
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
			el.setPointerCapture?.(e.pointerId);
			const bit = buttonBit(e.button);
			this.#buttons |= bit;
			this.#pressedButtons |= bit;
			if (e.button === 0) {
				this.#down = true;
				this.#pressed = true;
			}
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
					this.onClick?.({ button: e.button, x: this.#x, y: this.#y, ...this.#mods });
				}
			}
			const bits = e.type === "pointercancel" ? this.#buttons : buttonBit(e.button);
			this.#releasedButtons |= this.#buttons & bits;
			this.#buttons &= ~bits;
			if (e.button === 0 || e.type === "pointercancel") {
				if (this.#down) this.#released = true;
				this.#down = false;
			}
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
			this.#wheelX += e.deltaX * k;
			this.#wheelZoom = !!(e.ctrlKey || e.metaKey);
			changed();
		};
		const contextmenu = (e: Event) => {
			if (!this.contextMenu) e.preventDefault();
		};
		const key = (e: KeyboardEvent) => {
			const mods = modifiers(e);
			const m = this.#mods;
			if (
				mods.shift === m.shift && mods.ctrl === m.ctrl && mods.alt === m.alt && mods.meta === m.meta
			) return;
			this.#mods = mods;
			changed();
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerdown", down);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", up);
		el.addEventListener("pointerleave", leave);
		el.addEventListener("wheel", wheel, { passive: false });
		el.addEventListener("contextmenu", contextmenu);
		// Modifier changes matter even while the pointer sits still (e.g. a shift-hover highlight).
		globalThis.addEventListener?.("keydown", key as EventListener);
		globalThis.addEventListener?.("keyup", key as EventListener);
		return () => {
			el.removeEventListener("contextmenu", contextmenu);
			globalThis.removeEventListener?.("keydown", key as EventListener);
			globalThis.removeEventListener?.("keyup", key as EventListener);
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
			buttons: this.#buttons,
			pressedButtons: this.#pressedButtons,
			releasedButtons: this.#releasedButtons,
			wheel: this.#wheel,
			wheelX: this.#wheelX,
			wheelZoom: this.#wheelZoom,
			...this.#mods,
		};
		this.#lastX = this.#x;
		this.#lastY = this.#y;
		this.#pressed = this.#released = false;
		this.#pressedButtons = this.#releasedButtons = 0;
		this.#wheel = this.#wheelX = 0;
		this.#wheelZoom = false;
		this.pending = false;
		return s;
	}
}

function modifiers(
	e: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean },
): Modifiers {
	return { shift: !!e.shiftKey, ctrl: !!e.ctrlKey, alt: !!e.altKey, meta: !!e.metaKey };
}
