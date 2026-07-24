import { getCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { Signal } from "./signals/wrapper.ts";

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
	#dirty = new Signal.State(false);
	set(val: T) {
		super.set(val);
		this.#dirty.set(true);
	}
	isDirty(): boolean {
		return this.#dirty.get();
	}
	clearDirty(): void {
		this.#dirty.set(false);
	}
}

export class LazySignal<T> extends Signal.State<T> {
	#fetcher: () => Promise<T>;
	#fetched = false;
	constructor(initial: T, fetcher: () => T | Promise<T>) {
		super(initial);
		this.#fetcher = async () => await fetcher();
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
	constructor(init: () => T, callback: (val: T) => void) {
		super(init);
		this.#callback = callback;
	}
	#callback: (val: T) => void;

	set(val: T) {
		this.#callback(val);
	}
}

// TODO: figure out a good name for this
export class SpreadSignal<T extends object> extends Signal.State<T> {
	$: T = {} as T;
	constructor(init: T) {
		super(init);
		this.#buildShadow(init);
	}

	#buildShadow(from: T) {
		if (!from) return;
		this.$ = {} as T;
		Object.keys(from).map((k) =>
			Object.assign(
				this.$,
				k,
				new DerivedSignal(() => this.get()[k as keyof T], (v) => {
					const obj = this.get();
					Object.assign(obj, k, v);
					super.set(obj);
				}),
			)
		);
	}

	set(val: T) {
		super.set(val);
		this.#buildShadow(val);
	}
}

export class ArraySignal<T> extends Signal.State<T[]> {
	static #proxiedProps = new Set<keyof unknown[]>(["push", "pop", "shift", "unshift", "splice", "sort", "reverse"]);

	constructor(init: T[]) {
		super(init);
	}

	get(): T[] {
		const targetArray = super.get();

		const handler: ProxyHandler<T[]> = {
			get: (target, prop) => {
				if (typeof prop === "string" && ArraySignal.#proxiedProps.has(prop as keyof unknown[])) {
					const methodName = prop as Extract<keyof T[], string>;

					return (...args: unknown[]) => {
						const clone = [...target];
						const method = clone[methodName];

						if (typeof method === "function") {
							// deno-lint-ignore ban-types
							const result = (method as Function).apply(clone, args);
							this.set(clone);
							return result;
						}
					};
				}

				return Reflect.get(target, prop);
			},
			set: (target, prop, value, receiver) => {
				if (prop === "length") {
					return Reflect.set(target, prop, value, receiver);
				}

				const success = Reflect.set(target, prop, value, receiver);

				if (success) {
					this.set([...target]);
				}

				return success;
			}
		};

		return new Proxy(targetArray, handler);
	}
}


export class DirtyArraySignal<T> extends ArraySignal<T> {
	#dirty = new Signal.State(false);

	set(val: T[]) {
		super.set(val);
		this.#dirty.set(true);
	}
	isDirty(): boolean {
		return this.#dirty.get();
	}
	clearDirty(): void {
		this.#dirty.set(false);
	}
}
