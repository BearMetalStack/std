import { getCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { Signal } from "./signals/wrapper.ts";

export { Signal } from "./signals/wrapper.ts";
export * from "./signals.ts";

/**
 * A `Signal.State` whose writes land after `debounceDurationMs` of quiet.
 *
 * `get()` keeps returning the last landed value until then; `pending` says a
 * write is waiting, and `flush()` lands it now. Created under an owner, a
 * waiting write is landed (not dropped) when the owner is torn down.
 */
export class DebouncedSignal<T> extends Signal.State<T> {
	/** Whether a write is waiting out the debounce. */
	readonly pending: Signal.State<boolean> = new Signal.State(false);
	#timer?: ReturnType<typeof setTimeout>;
	#next?: T;

	constructor(initial: T, private debounceDurationMs: number) {
		super(initial);
		getCurrentOwner()?.registerCleanup(() => this.flush());
	}

	set(val: T): void {
		clearTimeout(this.#timer);
		this.#next = val;
		this.pending.set(true);
		this.#timer = setTimeout(() => this.flush(), this.debounceDurationMs);
	}

	/** Lands the waiting write now, if there is one. */
	flush(): void {
		clearTimeout(this.#timer);
		if (!Signal.subtle.untrack(() => this.pending.get())) return;
		this.pending.set(false);
		super.set(this.#next as T);
	}

	/** Drops the waiting write, if there is one. */
	cancel(): void {
		clearTimeout(this.#timer);
		this.pending.set(false);
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
		getCurrentOwner()?.registerCleanup(() => this.cancel());
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
		this.#prime();
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
		const same = Object.is(Signal.subtle.untrack(() => super.get()), val);
		super.set(val);
		if (!same) this.#dirty.set(true);
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
	/** Whether a fetch is running. */
	readonly loading: Signal.State<boolean> = new Signal.State(false);
	/**
	 * The last fetch's error, cleared by the next success. A failed fetch is not
	 * retried by reading again, only by {@linkcode LazySignal.refresh}.
	 */
	readonly error: Signal.State<unknown> = new Signal.State<unknown>(undefined);
	#failed = false;

	constructor(initial: T, fetcher: () => T | Promise<T>) {
		super(initial);
		this.#fetcher = async () => await fetcher();
	}
	set(val: T) {
		this.#fetched = true;
		super.set(val);
	}
	get(): T {
		if (!this.#fetched && !this.#inflight && !this.#failed) this.#fetch(false);
		return super.get();
	}

	/** Fetches again, replacing the current value when it lands. */
	refresh(): Promise<void> {
		return this.#fetch(true);
	}

	#fetch(force: boolean): Promise<void> {
		this.#failed = false;
		this.loading.set(true);
		const run = this.#fetcher().then(
			(val) => {
				if (this.#inflight !== run) return;
				this.#inflight = null;
				this.loading.set(false);
				this.error.set(undefined);
				if (force || !this.#fetched) this.set(val);
			},
			(e) => {
				if (this.#inflight === run) {
					this.#inflight = null;
					this.#failed = true;
					this.loading.set(false);
					this.error.set(e);
				}
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

type FieldSignals<T> = {
	[K in keyof T]: WritableComputed<T[K]>;
};

/**
 * An object signal with a writable signal per field, `$.<field>`. Writing a
 * field changes it in place and notifies that field's readers only: whoever
 * reads the whole object (`get()`) is not re-run by a field write.
 * Replacing the object with `set()` notifies everyone.
 *
 * Field signals are made on first use and kept, so one held across a `set()`
 * keeps working, and keys the object gains later get fields too.
 */
export class StructSignal<T extends object> extends Signal.State<T> {
	#fields = new Map<PropertyKey, WritableComputed<unknown>>();
	#revision = new Signal.State(0);

	/** Reactive fields of the object, which change it without notifying `get()`'s readers. */
	readonly $: FieldSignals<T> = new Proxy({} as FieldSignals<T>, {
		get: (_, key) => this.#field(key),
		has: (_, key) => key in this.#raw(),
		ownKeys: () => Reflect.ownKeys(this.#raw()),
		getOwnPropertyDescriptor: (_, key) =>
			key in this.#raw()
				? { configurable: true, enumerable: true, value: this.#field(key) }
				: undefined,
	});

	#raw(): T {
		return Signal.subtle.untrack(() => Signal.State.prototype.get.call(this) as T);
	}

	#field(key: PropertyKey): WritableComputed<unknown> {
		let field = this.#fields.get(key);
		if (!field) {
			field = new WritableComputed(
				() => {
					this.#revision.get();
					return (this.get() as Record<PropertyKey, unknown>)[key];
				},
				(value) => {
					const object = this.#raw() as Record<PropertyKey, unknown>;
					if (Object.is(object[key], value)) return;
					object[key] = value;
					this.#revision.set(Signal.subtle.untrack(() => this.#revision.get()) + 1);
				},
			);
			this.#fields.set(key, field);
		}
		return field;
	}
}

/**
 * An array signal whose array can be changed with the usual methods:
 * `get().push(x)`, `get()[i] = x`, `get().length = 0`.
 *
 * The arrays themselves are never changed: each change copies the current
 * array and sets the copy, so a snapshot already taken (`[...get()]`, or the
 * value an `equals` saw) stays as it was. What `get()` returns is a view onto
 * whatever the signal holds *now*, so several changes through one held view
 * all apply. `get()` hands back the same view until the array changes.
 */
export class ArraySignal<T> extends Signal.State<T[]> {
	static #proxiedProps = new Set<PropertyKey>([
		"push",
		"pop",
		"shift",
		"unshift",
		"splice",
		"sort",
		"reverse",
		"fill",
		"copyWithin",
	]);

	#proxies = new WeakMap<T[], T[]>();
	#targets = new WeakMap<T[], T[]>();

	constructor(init: T[]) {
		super(init);
	}

	set(val: T[]): void {
		super.set(this.#targets.get(val) ?? val);
	}

	get(): T[] {
		const target = super.get();
		let proxy = this.#proxies.get(target);
		if (!proxy) {
			proxy = new Proxy(target, this.#handler());
			this.#proxies.set(target, proxy);
			this.#targets.set(proxy, target);
		}
		return proxy;
	}

	/** The array held now, read without tracking. */
	#current(): T[] {
		return Signal.subtle.untrack(() => Signal.State.prototype.get.call(this) as T[]);
	}

	#handler(): ProxyHandler<T[]> {
		const change = (fn: (copy: T[]) => unknown) => {
			const copy = [...this.#current()];
			const result = fn(copy);
			this.set(copy);
			return result;
		};
		return {
			get: (_, prop) => {
				if (ArraySignal.#proxiedProps.has(prop)) {
					return (...args: unknown[]) =>
						change(
							// deno-lint-ignore ban-types
							(copy) => ((copy as any)[prop] as Function).apply(copy, args),
						);
				}
				return Reflect.get(this.#current(), prop);
			},
			set: (_, prop, value) => {
				change((copy) => Reflect.set(copy, prop, value));
				return true;
			},
			deleteProperty: (_, prop) => {
				change((copy) => Reflect.deleteProperty(copy, prop));
				return true;
			},
			has: (_, prop) => Reflect.has(this.#current(), prop),
			ownKeys: () => Reflect.ownKeys(this.#current()),
			getOwnPropertyDescriptor: (_, prop) => {
				const desc = Reflect.getOwnPropertyDescriptor(this.#current(), prop);
				// `length` is non-configurable on every array, the target included.
				if (desc && prop !== "length") desc.configurable = true;
				return desc;
			},
		};
	}
}

export class DirtyArraySignal<T> extends ArraySignal<T> {
	#dirty = new Signal.State(false);

	set(val: T[]) {
		const before = Signal.subtle.untrack(() => super.get());
		super.set(val);
		const after = Signal.subtle.untrack(() => super.get());
		const same = before.length === after.length && before.every((v, i) => Object.is(v, after[i]));
		if (!same) this.#dirty.set(true);
	}
	isDirty(): boolean {
		return this.#dirty.get();
	}
	clearDirty(): void {
		this.#dirty.set(false);
	}
}
