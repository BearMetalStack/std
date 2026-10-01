import { getCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { Signal } from "./signals/wrapper.ts";

export { Signal } from "./signals/wrapper.ts";
export * from "./signals.ts";

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
		this.#timer = setInterval(
			() => this.set(this.#callback(this.get())),
			this.#duration,
		);
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

/**
 * A `Signal.State` that fetches its value the first time it is read, starting
 * from `initial` until the fetch lands. A value `set()` before then wins over
 * the fetch.
 *
 * Each instance fetches once, so a function that returns `new LazySignal(...)`
 * hands every caller a fresh, empty signal — a computed re-running it only ever
 * sees `initial`. Use {@linkcode createLazySignals} to get the same signal back
 * for the same arguments.
 */
export class LazySignal<T> extends Signal.State<T> {
	#fetcher: () => Promise<T>;
	#fetched = false;
	#inflight: Promise<void> | null = null;
	constructor(initial: T, fetcher: () => T | Promise<T>) {
		super(initial);
		this.#fetcher = async () => await fetcher();
	}
	set(val: T) {
		this.#fetched = true;
		super.set(val);
	}
	get(): T {
		if (!this.#fetched && !this.#inflight) this.#fetch(false);
		return super.get();
	}

	/** Fetches again, replacing the current value when it lands. */
	refresh(): Promise<void> {
		return this.#fetch(true);
	}

	#fetch(force: boolean): Promise<void> {
		const run = this.#fetcher().then(
			(val) => {
				if (this.#inflight === run) this.#inflight = null;
				if (force || !this.#fetched) this.set(val);
			},
			(e) => {
				if (this.#inflight === run) this.#inflight = null;
				throw e;
			},
		);
		this.#inflight = run;
		run.catch((e) => console.error("LazySignal fetch failed:", e));
		return run;
	}
}

/** A memoized family of {@linkcode LazySignal}s; see {@linkcode createLazySignals}. */
export interface LazySignals<TArgs extends unknown[], T> {
	/** The signal for these arguments — the same one every time until it is deleted. */
	(...args: TArgs): LazySignal<T>;
	/** Refetches the signal for these arguments, if one exists. */
	refresh(...args: TArgs): Promise<void>;
	/** Refetches every signal created so far. */
	refreshAll(): Promise<void>;
	/** Forgets the signal for these arguments; the next call makes a new one. */
	delete(...args: TArgs): boolean;
	/** Forgets every signal. */
	clear(): void;
}

/**
 * A keyed {@linkcode LazySignal} factory: the same arguments give back the same
 * signal, so a computed that asks for it on every run sees the fetch land
 * instead of a new, empty signal each time.
 *
 * Arguments are keyed with `JSON.stringify` unless `key` says otherwise.
 *
 * @example
 * ```ts
 * const characters = createLazySignals([], (project: string) => api.characters(project));
 * const names = createComputed(() => characters(projectId.get()).get().map((c) => c.name));
 * ```
 */
export function createLazySignals<TArgs extends unknown[], T>(
	initial: T | ((...args: TArgs) => T),
	fetcher: (...args: TArgs) => T | Promise<T>,
	options: { key?: (...args: TArgs) => unknown } = {},
): LazySignals<TArgs, T> {
	const cache = new Map<unknown, LazySignal<T>>();
	const keyOf = options.key ?? ((...args: TArgs) => JSON.stringify(args));
	const family = (...args: TArgs): LazySignal<T> => {
		const k = keyOf(...args);
		let signal = cache.get(k);
		if (!signal) {
			const start = typeof initial === "function"
				? (initial as (...args: TArgs) => T)(...args)
				: initial;
			signal = new LazySignal(start, () => fetcher(...args));
			cache.set(k, signal);
		}
		return signal;
	};
	return Object.assign(family, {
		refresh: (...args: TArgs) => cache.get(keyOf(...args))?.refresh() ?? Promise.resolve(),
		refreshAll: async () => {
			await Promise.all([...cache.values()].map((s) => s.refresh()));
		},
		delete: (...args: TArgs) => cache.delete(keyOf(...args)),
		clear: () => cache.clear(),
	});
}

/**
 * A `Signal.Computed` that's also writable, via a callback rather than
 * mutable backing state - the clean way to hand `$bind` something derived
 * from other signals.
 *
 * A plain `Signal.State` kept in sync by your own effect also works, but the
 * mirrored value reaches `$bind` one effect pass later, and the copy is one
 * more thing to keep consistent. `WritableComputed` needs no effect at all -
 * `get()` reads the source signals directly, and `set()` forwards to whatever
 * action should actually own the write (or is a no-op, if this field is
 * read-only and committed some other way, e.g. on blur).
 */
export class WritableComputed<T> extends Signal.Computed<T> {
	constructor(get: () => T, set: (val: T) => void) {
		super(get);
		this.#set = set;
	}
	#set: (val: T) => void;

	set(val: T) {
		this.#set(val);
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
				new WritableComputed(() => this.get()[k as keyof T], (v) => {
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
	static #proxiedProps = new Set<keyof unknown[]>([
		"push",
		"pop",
		"shift",
		"unshift",
		"splice",
		"sort",
		"reverse",
	]);

	constructor(init: T[]) {
		super(init);
	}

	get(): T[] {
		const targetArray = super.get();

		const handler: ProxyHandler<T[]> = {
			get: (target, prop) => {
				if (
					typeof prop === "string" &&
					ArraySignal.#proxiedProps.has(prop as keyof unknown[])
				) {
					const methodName = prop as Extract<keyof T[], string>;

					return (...args: unknown[]) => {
						const clone = [...target];
						const method = clone[methodName];

						if (typeof method === "function") {
							// deno-lint-ignore ban-types
							const result = (method as Function).apply(
								clone,
								args,
							);
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
			},
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
