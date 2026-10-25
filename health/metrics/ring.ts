import type { Point } from "../types.ts";

/** A clock returning epoch milliseconds. Injectable so tests control time. */
export type Clock = () => number;

/**
 * Sums values into fixed-width time buckets, keeping the most recent `count` of them. Buckets
 * nothing was added to read as zero, so a quiet minute still charts as a flat line.
 */
export class BucketRing {
	readonly #starts: number[];
	readonly #values: number[];

	constructor(
		readonly bucket: number,
		readonly count: number,
		readonly clock: Clock = Date.now,
	) {
		if (bucket <= 0 || count <= 0) throw new RangeError("bucket and count must be positive");
		this.#starts = new Array(count).fill(-1);
		this.#values = new Array(count).fill(0);
	}

	#startOf(t: number): number {
		return Math.floor(t / this.bucket) * this.bucket;
	}

	#slot(start: number): number {
		return (start / this.bucket) % this.count;
	}

	/** Adds `value` to the bucket holding the current time. */
	add(value = 1): void {
		const start = this.#startOf(this.clock());
		const slot = this.#slot(start);
		if (this.#starts[slot] !== start) {
			this.#starts[slot] = start;
			this.#values[slot] = 0;
		}
		this.#values[slot] += value;
	}

	/** The value of the bucket starting at `start`, or 0 if it has rolled off or was never touched. */
	valueAt(start: number): number {
		const slot = this.#slot(start);
		return this.#starts[slot] === start ? this.#values[slot] : 0;
	}

	/** Every bucket in the window, oldest first, including the one still filling. */
	points(): Point[] {
		const current = this.#startOf(this.clock());
		const out: Point[] = [];
		for (let i = this.count - 1; i >= 0; i--) {
			const start = current - i * this.bucket;
			out.push([start, this.valueAt(start)]);
		}
		return out;
	}

	/** The most recent bucket that has finished filling. */
	lastComplete(): Point {
		const start = this.#startOf(this.clock()) - this.bucket;
		return [start, this.valueAt(start)];
	}

	/** Sum over the completed buckets in the window, excluding the one still filling. */
	completedTotal(): number {
		const current = this.#startOf(this.clock());
		let total = 0;
		for (let i = 1; i < this.count; i++) total += this.valueAt(current - i * this.bucket);
		return total;
	}
}

/** A sample kept by {@link SampleRing}. */
export interface Sample {
	t: number;
	value: number;
}

/** Keeps the latest `capacity` timestamped samples, overwriting the oldest. */
export class SampleRing {
	readonly #samples: (Sample | undefined)[];
	#next = 0;

	constructor(readonly capacity: number, readonly clock: Clock = Date.now) {
		if (capacity <= 0) throw new RangeError("capacity must be positive");
		this.#samples = new Array(capacity);
	}

	push(value: number): void {
		this.#samples[this.#next] = { t: this.clock(), value };
		this.#next = (this.#next + 1) % this.capacity;
	}

	/** Samples from the last `window` milliseconds, oldest first. */
	within(window: number): Sample[] {
		const since = this.clock() - window;
		const out: Sample[] = [];
		for (let i = 0; i < this.capacity; i++) {
			const s = this.#samples[(this.#next + i) % this.capacity];
			if (s && s.t >= since) out.push(s);
		}
		return out;
	}

	/** The most recent sample, if any. */
	latest(): Sample | undefined {
		return this.#samples[(this.#next - 1 + this.capacity) % this.capacity];
	}
}

/** The `q` quantile (0-1) of `values`, by nearest rank. `NaN` when there are none. */
export function quantile(values: number[], q: number): number {
	if (values.length === 0) return NaN;
	const sorted = values.toSorted((a, b) => a - b);
	const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
	return sorted[rank];
}
