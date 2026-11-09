import { getCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { Signal } from "./signals/wrapper.ts";
import { createComputed, watch } from "./signals.ts";
import { createSaveTask, type SaveTask, type SaveTaskOptions } from "./save.ts";
import type { SignalOf } from "./types.ts";

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
	const family = createFamily((...args: TArgs) => {
		const start = typeof initial === "function"
			? (initial as (...args: TArgs) => T)(...args)
			: initial;
		return new LazySignal(start, () => fetcher(...args));
	}, options);
	return Object.assign((...args: TArgs) => family(...args), {
		refresh: (...args: TArgs) =>
			family.has(...args) ? family(...args).refresh() : Promise.resolve(),
		refreshAll: async () => {
			await Promise.all([...family.values()].map((s) => s.refresh()));
		},
		delete: (...args: TArgs) => family.delete(...args),
		clear: () => family.clear(),
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

// ── Families ─────────────────────────────────────────────────────────────────

/** A memoized, keyed set of values; see {@linkcode createFamily}. */
export interface Family<TArgs extends unknown[], S> {
	/** The value for these arguments, made on first use and the same one after. */
	(...args: TArgs): S;
	/** Whether a value exists for these arguments, without making one. */
	has(...args: TArgs): boolean;
	/** Forgets the value for these arguments; the next call makes a new one. */
	delete(...args: TArgs): boolean;
	/** Forgets every value. */
	clear(): void;
	/** Every value made so far, in the order they were made. */
	values(): IterableIterator<S>;
}

/**
 * One value per key, made on first use and handed back after: per-row fold
 * state, per-id signals, per-project caches. Arguments are keyed with
 * `JSON.stringify` unless `key` says otherwise.
 *
 * @example
 * ```ts
 * const folded = createFamily((sectionId: string) => new Signal.State(false));
 * folded("draft.chapters").set(true);
 * ```
 */
export function createFamily<TArgs extends unknown[], S>(
	make: (...args: TArgs) => S,
	{ key }: { key?: (...args: TArgs) => unknown } = {},
): Family<TArgs, S> {
	const cache = new Map<unknown, S>();
	const keyOf = key ?? ((...args: TArgs) => JSON.stringify(args));
	const family = (...args: TArgs): S => {
		const k = keyOf(...args);
		if (cache.has(k)) return cache.get(k)!;
		const value = make(...args);
		cache.set(k, value);
		return value;
	};
	return Object.assign(family, {
		has: (...args: TArgs) => cache.has(keyOf(...args)),
		delete: (...args: TArgs) => cache.delete(keyOf(...args)),
		clear: () => cache.clear(),
		values: () => cache.values(),
	});
}

// ── Lists ────────────────────────────────────────────────────────────────────

/**
 * An array signal changed through methods that each set a new array: the
 * arrays are never mutated, so a value someone read stays as it was, and
 * `get()` is the array itself (no proxy).
 *
 * @example
 * ```ts
 * const tabs = new ListSignal<Tab>([]);
 * tabs.insert(2, tab);
 * tabs.move(0, 3);
 * tabs.remove((t) => t.uuid === id);
 * ```
 */
export class ListSignal<T> extends Signal.State<readonly T[]> {
	#current(): readonly T[] {
		return Signal.subtle.untrack(() => this.get());
	}

	/** Replaces the list with `fn(list)`. */
	update(fn: (list: T[]) => readonly T[] | void): void {
		const copy = [...this.#current()];
		const result = fn(copy);
		this.set(result ?? copy);
	}

	push(...items: T[]): void {
		this.set([...this.#current(), ...items]);
	}

	/** Inserts at `index`, clamped to the list. */
	insert(index: number, ...items: T[]): void {
		this.update((list) => {
			list.splice(Math.max(0, Math.min(index, list.length)), 0, ...items);
		});
	}

	/** Removes `item`, or every item `item` accepts if it is a predicate. Returns how many went. */
	remove(item: T | ((item: T) => boolean)): number {
		const list = this.#current();
		const test = typeof item === "function"
			? item as (item: T) => boolean
			: (i: T) => Object.is(i, item);
		const next = list.filter((i) => !test(i));
		if (next.length !== list.length) this.set(next);
		return list.length - next.length;
	}

	removeAt(index: number): T | undefined {
		const list = this.#current();
		if (index < 0 || index >= list.length) return undefined;
		const removed = list[index];
		this.set(list.filter((_, i) => i !== index));
		return removed;
	}

	/** Moves the item at `from` to `to` (an index in the list after removal), clamped. */
	move(from: number, to: number): void {
		this.update((list) => {
			if (from < 0 || from >= list.length) return;
			const [item] = list.splice(from, 1);
			list.splice(Math.max(0, Math.min(to, list.length)), 0, item);
		});
	}

	/** Replaces the item at `index`. */
	replace(index: number, item: T): void {
		this.update((list) => {
			if (index >= 0 && index < list.length) list[index] = item;
		});
	}
}

// ── Async ────────────────────────────────────────────────────────────────────

/** What {@linkcode createResource} hands back. */
export interface Resource<T> {
	/** The last value fetched (or set with `mutate`), `initial` until one is. */
	readonly value: Signal.Computed<T>;
	/** Whether a fetch for the current key is running. */
	readonly loading: Signal.Computed<boolean>;
	/** The current key's fetch error, cleared by the next success. */
	readonly error: Signal.Computed<unknown>;
	/** Fetches the current key again. */
	refresh(): Promise<void>;
	/** Resolves when the fetch for the key current now has settled (either way). */
	ready(): Promise<void>;
	/** Sets the value locally, without fetching. */
	mutate(value: T): void;
}

/** Options for {@linkcode createResource}. */
export interface ResourceOptions<T> {
	/** The value before anything has been fetched, and while the key is `null`/`undefined`. */
	initial: T;
}

/**
 * A value fetched for a key, refetched when the key changes. The latest key
 * wins: a fetch for a key that has since changed is aborted (its
 * `AbortSignal` fires) and whatever it resolves to is ignored, so a slow
 * answer for an old key can never land over a newer one. A `null` or
 * `undefined` key fetches nothing and resets the value to `initial`.
 *
 * The value of the previous key stays until the new one lands; read `loading`
 * to show that it is stale. Owned like an effect: the in-flight fetch is
 * aborted when the owner is torn down.
 *
 * @example
 * ```ts
 * const draft = createResource(draftId, (id, { signal }) => api.draft(id, { signal }), { initial: null });
 * <Switch $={createComputed(() => draft.loading.get() ? "loading" : draft.value.get() ? "ready" : "empty")}>…
 * ```
 */
export function createResource<K, T>(
	key: SignalOf<K | null | undefined> | (() => K | null | undefined),
	fetch: (key: K, context: { signal: AbortSignal }) => T | Promise<T>,
	{ initial }: ResourceOptions<T>,
): Resource<T> {
	const value = new Signal.State<T>(initial);
	const loading = new Signal.State(false);
	const error = new Signal.State<unknown>(undefined);
	let current: Promise<void> = Promise.resolve();
	let rerun: () => Promise<void> = () => Promise.resolve();

	const run = (k: K | null | undefined): { settled: Promise<void>; abort: () => void } => {
		const controller = new AbortController();
		if (k == null) {
			loading.set(false);
			error.set(undefined);
			value.set(initial);
			return { settled: Promise.resolve(), abort: () => controller.abort() };
		}
		loading.set(true);
		const settled = (async () => {
			try {
				const next = await fetch(k, { signal: controller.signal });
				if (controller.signal.aborted) return;
				value.set(next);
				error.set(undefined);
			} catch (e) {
				if (controller.signal.aborted) return;
				error.set(e);
			} finally {
				if (!controller.signal.aborted) loading.set(false);
			}
		})();
		return { settled, abort: () => controller.abort() };
	};

	watch(key, (k) => {
		let job = run(k);
		current = job.settled;
		rerun = () => {
			job.abort();
			job = run(k);
			current = job.settled;
			return current;
		};
		return () => job.abort();
	});

	return {
		value: createComputed(() => value.get()),
		loading: createComputed(() => loading.get()),
		error: createComputed(() => error.get()),
		refresh: () => rerun(),
		ready: () => current,
		mutate: (v) => value.set(v),
	};
}

// ── Persistence ──────────────────────────────────────────────────────────────

/** How {@linkcode storageSignal} turns values into strings and back. */
export interface StorageCodec<T> {
	encode(value: T): string;
	decode(raw: string): T;
}

const JSON_CODEC: StorageCodec<unknown> = {
	encode: (value) => JSON.stringify(value),
	decode: (raw) => JSON.parse(raw),
};

/**
 * A signal kept in `localStorage` (or the `storage` given) under `key`: read
 * once when made, written on every `set()`. A missing, unreadable or
 * undecodable entry gives `initial`, and one that fails to decode is removed.
 * Storage that is unavailable (a server, a locked-down browser) or full is
 * skipped quietly; the signal still works in memory.
 *
 * One signal per key. For a key that changes, keep a family of them
 * ({@linkcode createFamily}).
 */
export function storageSignal<T>(
	key: string,
	initial: T,
	{ storage, codec = JSON_CODEC as StorageCodec<T> }: {
		storage?: Storage;
		codec?: StorageCodec<T>;
	} = {},
): Signal.State<T> {
	const store = (): Storage | undefined => {
		try {
			return storage ?? globalThis.localStorage;
		} catch {
			return undefined;
		}
	};
	let start = initial;
	try {
		const raw = store()?.getItem(key);
		if (raw != null) start = codec.decode(raw);
	} catch {
		try {
			store()?.removeItem(key);
		} catch { /* unavailable */ }
	}
	return new (class extends Signal.State<T> {
		override set(value: T): void {
			super.set(value);
			try {
				store()?.setItem(key, codec.encode(value));
			} catch { /* unavailable or full */ }
		}
	})(start);
}

/** Options for {@linkcode createPersisted}. */
export interface PersistedOptions extends Pick<SaveTaskOptions, "debounceMs" | "label" | "owned"> {}

/**
 * A signal backed by asynchronous storage: loaded once with `load`, saved
 * through a {@linkcode createSaveTask} (debounced, flushable, retried, and
 * reached by `flushAllSaves()`) on every `set()`.
 *
 * Starts at `initial`. A loaded value replaces it unless something was set
 * first, in which case the local write wins and the loaded one is dropped.
 * `load` resolving to `undefined` means nothing was stored.
 *
 * Changes go through `set()` or `update()`, so they are seen: mutating the
 * object in place is not.
 */
export class PersistedSignal<T> extends Signal.State<T> {
	/** Whether the first load is still running. */
	readonly loading: Signal.State<boolean> = new Signal.State(true);
	/** The load's error, if it failed. The signal keeps `initial` (or whatever was set). */
	readonly loadError: Signal.State<unknown> = new Signal.State<unknown>(undefined);
	/** The save task behind it: its status, dirtiness and errors. */
	readonly saves: SaveTask<T>;
	/** Resolves once the first load has settled. */
	readonly loaded: Promise<void>;
	#touched = false;

	constructor(
		initial: T,
		load: () => T | undefined | Promise<T | undefined>,
		save: (value: T) => unknown | Promise<unknown>,
		options: PersistedOptions = {},
	) {
		super(initial);
		this.saves = createSaveTask(save, options);
		this.loaded = (async () => {
			try {
				const stored = await load();
				if (stored !== undefined && !this.#touched) super.set(stored);
			} catch (e) {
				this.loadError.set(e);
			} finally {
				this.loading.set(false);
			}
		})();
	}

	override set(value: T): void {
		this.#touched = true;
		super.set(value);
		this.saves.schedule(value);
	}

	/** Sets `fn(current)`. */
	update(fn: (current: T) => T): void {
		this.set(fn(Signal.subtle.untrack(() => this.get())));
	}

	/** Saves any pending change now. */
	flush(): Promise<void> {
		return this.saves.flush();
	}
}

/** Makes a {@linkcode PersistedSignal}. */
export function createPersisted<T>(
	initial: T,
	load: () => T | undefined | Promise<T | undefined>,
	save: (value: T) => unknown | Promise<unknown>,
	options: PersistedOptions = {},
): PersistedSignal<T> {
	return new PersistedSignal(initial, load, save, options);
}
