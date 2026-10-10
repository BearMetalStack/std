/**
 * Idle float, from `data-bob="ampY periodY [ampX periodX]"` on the root
 * `<svg>`. Amplitudes are in SVG user units, periods in seconds.
 */
export interface Bob {
	ampY: number;
	periodY: number;
	ampX: number;
	periodX: number;
}

export function parseBob(value: string | null): Bob | undefined {
	if (!value) return undefined;
	const [ampY = 0, periodY = 3, ampX = 0, periodX = 5] = value.trim().split(/[\s,]+/).map(Number);
	if ([ampY, periodY, ampX, periodX].some((n) => !Number.isFinite(n))) return undefined;
	return { ampY, periodY, ampX, periodX };
}

/** The bob's offset at time `t` seconds, in SVG user units. */
export function bobOffset(bob: Bob, t: number): [number, number] {
	const x = bob.periodX ? bob.ampX * Math.sin((2 * Math.PI * t) / bob.periodX) : 0;
	const y = bob.periodY ? bob.ampY * Math.sin((2 * Math.PI * t) / bob.periodY) : 0;
	return [x, y];
}

/** How far, in element widths, a full gaze offset of 1 counts as moving the body. */
const GAZE_TRAVEL = 0.35;
/** Converts acceleration in widths/s² into sway force. */
const ACCEL_SCALE = 6;
/** Converts velocity in widths/s into sway force. */
const DRAG_SCALE = 40;
const FILTER_SECONDS = 0.06;
const NUDGE_DECAY_SECONDS = 0.25;

/**
 * Tracks how the character's body is moving, combined from every source:
 * the gaze shift (the parallax reads as the body leaning), the element's real
 * on-screen movement, `nudge()` shoves, and the idle bob. Everything is in
 * element widths so a character sways the same at any size.
 */
export class Motion {
	velocityX = 0;
	velocityY = 0;
	accelerationX = 0;
	accelerationY = 0;

	#lastX?: number;
	#lastY?: number;
	#nudgeX = 0;
	#nudgeY = 0;
	#virtualX = 0;
	#virtualY = 0;

	/** A shove, in element widths per second. It fades out on its own. */
	nudge(vx: number, vy: number) {
		this.#nudgeX += vx;
		this.#nudgeY += vy;
	}

	/**
	 * Samples one frame.
	 *
	 * @param screen element center in element widths, or undefined if unknown
	 * @param gaze the smoothed gaze offset, each axis in [-1, 1]
	 * @param bob the bob offset in element widths
	 */
	update(
		dt: number,
		screen: [number, number] | undefined,
		gaze: [number, number],
		bob: [number, number],
	) {
		if (dt <= 0) return;
		dt = Math.min(dt, 1 / 20);

		const decay = Math.exp(-dt / NUDGE_DECAY_SECONDS);
		this.#virtualX += this.#nudgeX * dt;
		this.#virtualY += this.#nudgeY * dt;
		this.#nudgeX *= decay;
		this.#nudgeY *= decay;

		const x = (screen?.[0] ?? 0) + gaze[0] * GAZE_TRAVEL + bob[0] + this.#virtualX;
		const y = (screen?.[1] ?? 0) + gaze[1] * GAZE_TRAVEL + bob[1] + this.#virtualY;
		if (this.#lastX === undefined || this.#lastY === undefined) {
			this.#lastX = x, this.#lastY = y;
			return;
		}

		const k = 1 - Math.exp(-dt / FILTER_SECONDS);
		const vx = this.velocityX + ((x - this.#lastX) / dt - this.velocityX) * k;
		const vy = this.velocityY + ((y - this.#lastY) / dt - this.velocityY) * k;
		this.accelerationX += ((vx - this.velocityX) / dt - this.accelerationX) * k;
		this.accelerationY += ((vy - this.velocityY) / dt - this.accelerationY) * k;
		this.velocityX = vx, this.velocityY = vy;
		this.#lastX = x, this.#lastY = y;
	}

	/**
	 * What swings a hanging part: inertia from acceleration, plus air drag from
	 * velocity scaled by `drag`. Positive while the body moves or speeds up to
	 * the right, which turns a part clockwise so its far end trails left.
	 */
	force(drag: number): number {
		return this.accelerationX * ACCEL_SCALE + this.velocityX * DRAG_SCALE * drag;
	}
}
