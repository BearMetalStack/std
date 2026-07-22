import { getCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { Signal } from "./signals/wrapper.ts";
import type { SignalOf } from "./types.ts";

export { Signal } from "./signals/wrapper.ts";

export class DebouncedSignal<T> extends Signal.State<T> {
	constructor(initial: T, private debounceDurationMs: number) {
		super(initial);
	}
	#timer?: ReturnType<typeof setTimeout>;
	set(val: T) {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => super.set(val), this.debounceDurationMs);
	}
}

interface IntervalManager {
	cancel: () => void;
	setDuration: (durationMs: number) => void;
	getDurationMs: () => number;
	restart: () => void;
}

export class IntervalSignal<T> extends Signal.State<T> implements IntervalManager {
	#duration: number;
	#callback: (v: T) => T;
	constructor(
		initial: T,
		callback: (v: T) => T,
		intervalDurationMs: number,
	) {
		super(initial);
		this.#callback = callback;
		this.#duration = intervalDurationMs;
		this.#prime();
		getCurrentOwner()?.registerCleanup(this.cancel);
	}
	#prime() {
		this.#timer = setInterval(() => this.set(this.#callback(this.get())), this.#duration);
	}
	#timer?: ReturnType<typeof setInterval>;
	cancel() {
		clearInterval(this.#timer);
	}
	setDuration(durationMs: number) {
		this.cancel();
		this.#duration = durationMs;
		this.#prime;
	}
	getDurationMs(): number {
		return this.#duration;
	}
	restart() {
		this.cancel();
		this.#prime();
	}
}

export class DirtySignal<T> extends Signal.State<T> {
	#dirty: boolean = false;
	set(val: T) {
		super.set(val);
		this.#dirty = true;
	}
	isDirty(): boolean {
		return this.#dirty;
	}
	clearDirty(): void {
		this.#dirty = false;
	}
}

export class LazySignal<T> extends Signal.State<T> {
	#fetcher: () => Promise<T>;
	#fetched = false;
	constructor(initial: T, fetcher: () => Promise<T>) {
		super(initial);
		this.#fetcher = fetcher;
	}
	set(val: T) {
		super.set(val);
	}
	get(): T {
		if (!this.#fetched) {
			this.#fetcher().then((val) => super.set(val)).catch((e) => {
				this.#fetched = false;
				throw e;
			});
			this.#fetched = true;
		}
		return super.get();
	}
}

export class DerivedSignal<T> extends Signal.Computed<T> {
	constructor(private pinitial: SignalOf<T>, callback: (val: T) => void) {
		super(() => pinitial.get());
		this.#callback = callback;
	}
	#callback: (val: T) => void;

	set(val: T) {
		this.#callback(val);
	}
}
