import type { Comparer, MayPromise, Selector } from "../types.ts";

function defaultCompare<T>(a: T, b: T): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A lazy, LINQ-style pipeline over any iterable.
 *
 * Nothing runs until something consumes the chain (`for...of`, `toArray()`, `first()`, …), and
 * every operator streams: `where().select().take(3)` over a million items pulls only as many as it
 * takes to produce three. Only the operators that must see everything (`orderBy`, `groupBy`,
 * `reverse`) buffer, and each buffers exactly once.
 *
 * A chain is as re-iterable as its source. One built over an array can be consumed any number of
 * times; one built over a generator can be consumed once.
 *
 * @example
 * ```ts
 * const top = Chain.from(orders)
 *   .where((o) => o.paid)
 *   .groupBy((o) => o.customer)
 *   .select((g) => ({ customer: g.key, total: g.sum((o) => o.amount) }))
 *   .orderByDescending((r) => r.total)
 *   .take(5)
 *   .toArray();
 * ```
 */
export class Chain<T> implements Iterable<T> {
	protected readonly source: Iterable<T>;

	constructor(source: Iterable<T> = []) {
		this.source = source;
	}

	/** Chain one or more iterables end to end. */
	static from<T>(...sources: Iterable<T>[]): Chain<T> {
		if (sources.length === 1) return new Chain(sources[0]);
		return new Chain({
			*[Symbol.iterator]() {
				for (const s of sources) yield* s;
			},
		});
	}

	/** Drain any mix of arrays, promises of arrays, and async iterables, then chain the result. */
	static async fromAsync<T>(
		...sources: (MayPromise<Iterable<T>> | AsyncIterable<T>)[]
	): Promise<Chain<T>> {
		const lists = await Promise.all(
			sources.map((s) => Symbol.asyncIterator in s ? Array.fromAsync(s as AsyncIterable<T>) : s),
		);
		return Chain.from(...(lists as Iterable<T>[]));
	}

	static empty<T = never>(): Chain<T> {
		return new Chain<T>();
	}

	/** `count` integers starting at `start`. */
	static range(start: number, count: number): Chain<number> {
		return new Chain({
			*[Symbol.iterator]() {
				for (let i = 0; i < count; i++) yield start + i;
			},
		});
	}

	static repeat<T>(value: T, count: number): Chain<T> {
		return new Chain({
			*[Symbol.iterator]() {
				for (let i = 0; i < count; i++) yield value;
			},
		});
	}

	[Symbol.iterator](): Iterator<T> {
		return this.source[Symbol.iterator]();
	}

	protected derive<U>(fn: (source: Iterable<T>) => Iterator<U>): Chain<U> {
		const source = this.source;
		return new Chain<U>({ [Symbol.iterator]: () => fn(source) });
	}

	select<U>(fn: Selector<T, U>): Chain<U> {
		return this.derive(function* (source) {
			let i = 0;
			for (const item of source) yield fn(item, i++);
		});
	}

	selectMany<U>(fn: (item: T, index: number) => Iterable<U>): Chain<U> {
		return this.derive(function* (source) {
			let i = 0;
			for (const item of source) yield* fn(item, i++);
		});
	}

	where<S extends T>(fn: (item: T, index: number) => item is S): Chain<S>;
	where(fn: (item: T, index: number) => boolean): Chain<T>;
	where(fn: (item: T, index: number) => boolean): Chain<T> {
		return this.derive(function* (source) {
			let i = 0;
			for (const item of source) if (fn(item, i++)) yield item;
		});
	}

	/** Keeps the first `count` items and stops pulling from the source. */
	take(count: number): Chain<T> {
		return this.derive(function* (source) {
			if (count <= 0) return;
			let i = 0;
			for (const item of source) {
				yield item;
				if (++i >= count) return;
			}
		});
	}

	skip(count: number): Chain<T> {
		return this.derive(function* (source) {
			let i = 0;
			for (const item of source) if (i++ >= count) yield item;
		});
	}

	takeWhile(fn: (item: T, index: number) => boolean): Chain<T> {
		return this.derive(function* (source) {
			let i = 0;
			for (const item of source) {
				if (!fn(item, i++)) return;
				yield item;
			}
		});
	}

	skipWhile(fn: (item: T, index: number) => boolean): Chain<T> {
		return this.derive(function* (source) {
			let i = 0;
			let skipping = true;
			for (const item of source) {
				if (skipping && fn(item, i++)) continue;
				skipping = false;
				yield item;
			}
		});
	}

	concat(...others: Iterable<T>[]): Chain<T> {
		return Chain.from(this.source, ...others);
	}

	append(...items: T[]): Chain<T> {
		return this.concat(items);
	}

	prepend(...items: T[]): Chain<T> {
		return Chain.from(items, this.source);
	}

	/** Pairs items positionally; stops at the shorter side. */
	zip<U>(other: Iterable<U>): Chain<[T, U]>;
	zip<U, R>(other: Iterable<U>, fn: (a: T, b: U) => R): Chain<R>;
	zip<U, R>(other: Iterable<U>, fn?: (a: T, b: U) => R): Chain<R | [T, U]> {
		return this.derive(function* (source) {
			const b = other[Symbol.iterator]();
			for (const a of source) {
				const n = b.next();
				if (n.done) return;
				yield fn ? fn(a, n.value) : [a, n.value] as [T, U];
			}
		});
	}

	/** First occurrence of each item, by `SameValueZero` on the item or on `key(item)`. */
	distinct(key?: Selector<T, unknown>): Chain<T> {
		return this.derive(function* (source) {
			const seen = new Set<unknown>();
			let i = 0;
			for (const item of source) {
				const k = key ? key(item, i++) : item;
				if (seen.has(k)) continue;
				seen.add(k);
				yield item;
			}
		});
	}

	/** Split into arrays of `size`; the last may be shorter. */
	chunk(size: number): Chain<T[]> {
		if (!(size >= 1)) throw new RangeError("chunk size must be at least 1");
		return this.derive(function* (source) {
			let buf: T[] = [];
			for (const item of source) {
				buf.push(item);
				if (buf.length === size) {
					yield buf;
					buf = [];
				}
			}
			if (buf.length) yield buf;
		});
	}

	reverse(): Chain<T> {
		return this.derive(function* (source) {
			const all = [...source];
			for (let i = all.length - 1; i >= 0; i--) yield all[i];
		});
	}

	/**
	 * Stable ascending sort by `key`. Each key is computed once per item, not once per comparison.
	 * Chain `thenBy` for tie-breakers.
	 */
	orderBy<K>(key: Selector<T, K>, compare: Comparer<K> = defaultCompare): OrderedChain<T> {
		return new OrderedChain(this.source, [{ key, compare, sign: 1 }]);
	}

	orderByDescending<K>(
		key: Selector<T, K>,
		compare: Comparer<K> = defaultCompare,
	): OrderedChain<T> {
		return new OrderedChain(this.source, [{ key, compare, sign: -1 }]);
	}

	/**
	 * Group by `key`. Groups appear in order of first occurrence and keep source order inside.
	 * Each {@linkcode Grouping} is itself a `Chain` with a `.key`, so it sorts, maps and
	 * aggregates like any other, and so does the chain of groups.
	 *
	 * @example
	 * ```ts
	 * Chain.from(words)
	 *   .groupBy((w) => w[0])
	 *   .orderBy((g) => g.key)
	 *   .select((g) => `${g.key}: ${g.count()}`);
	 * ```
	 */
	groupBy<K>(key: Selector<T, K>): Chain<Grouping<K, T>>;
	groupBy<K, E>(key: Selector<T, K>, element: Selector<T, E>): Chain<Grouping<K, E>>;
	groupBy<K, E>(key: Selector<T, K>, element?: Selector<T, E>): Chain<Grouping<K, E | T>> {
		return this.derive(function* (source) {
			const groups = new Map<K, (E | T)[]>();
			let i = 0;
			for (const item of source) {
				const k = key(item, i);
				let bucket = groups.get(k);
				if (!bucket) groups.set(k, bucket = []);
				bucket.push(element ? element(item, i) : item);
				i++;
			}
			for (const [k, items] of groups) yield new Grouping(k, items);
		});
	}

	toArray(): T[] {
		return Array.from(this.source);
	}

	toSet(): Set<T> {
		return new Set(this.source);
	}

	/** Last write wins on a duplicate key; use `groupBy` to keep them all. */
	toMap<K>(key: Selector<T, K>): Map<K, T>;
	toMap<K, V>(key: Selector<T, K>, value: Selector<T, V>): Map<K, V>;
	toMap<K, V>(key: Selector<T, K>, value?: Selector<T, V>): Map<K, V | T> {
		const map = new Map<K, V | T>();
		let i = 0;
		for (const item of this.source) {
			map.set(key(item, i), value ? value(item, i) : item);
			i++;
		}
		return map;
	}

	toRecord(key: Selector<T, string>): Record<string, T>;
	toRecord<V>(key: Selector<T, string>, value: Selector<T, V>): Record<string, V>;
	toRecord<V>(key: Selector<T, string>, value?: Selector<T, V>): Record<string, V | T> {
		return Object.fromEntries(value ? this.toMap(key, value) : this.toMap(key));
	}

	forEach(fn: (item: T, index: number) => void): void {
		let i = 0;
		for (const item of this.source) fn(item, i++);
	}

	count(fn?: (item: T) => boolean): number {
		let n = 0;
		for (const item of this.source) if (!fn || fn(item)) n++;
		return n;
	}

	any(fn?: (item: T) => boolean): boolean {
		for (const item of this.source) if (!fn || fn(item)) return true;
		return false;
	}

	all(fn: (item: T) => boolean): boolean {
		for (const item of this.source) if (!fn(item)) return false;
		return true;
	}

	/** By `SameValueZero`, like `Array.prototype.includes`. */
	contains(value: T): boolean {
		for (const item of this.source) {
			if (item === value || (item !== item && value !== value)) return true;
		}
		return false;
	}

	/** First item (matching `fn`); throws if there is none. */
	first(fn?: (item: T) => boolean): T {
		for (const item of this.source) if (!fn || fn(item)) return item;
		throw new RangeError("Chain contains no matching element");
	}

	firstOrDefault(fn?: (item: T) => boolean): T | undefined;
	firstOrDefault<D>(fn: ((item: T) => boolean) | undefined, fallback: D): T | D;
	firstOrDefault<D>(fn?: (item: T) => boolean, fallback?: D): T | D | undefined {
		for (const item of this.source) if (!fn || fn(item)) return item;
		return fallback;
	}

	/** Last item (matching `fn`); throws if there is none. */
	last(fn?: (item: T) => boolean): T {
		let found = false;
		let result: T | undefined;
		for (const item of this.source) {
			if (!fn || fn(item)) {
				found = true;
				result = item;
			}
		}
		if (!found) throw new RangeError("Chain contains no matching element");
		return result as T;
	}

	lastOrDefault(fn?: (item: T) => boolean): T | undefined {
		let result: T | undefined;
		for (const item of this.source) if (!fn || fn(item)) result = item;
		return result;
	}

	/** The only item; throws if there are none or more than one. */
	single(fn?: (item: T) => boolean): T {
		let found = false;
		let result: T | undefined;
		for (const item of this.source) {
			if (fn && !fn(item)) continue;
			if (found) throw new RangeError("Chain contains more than one matching element");
			found = true;
			result = item;
		}
		if (!found) throw new RangeError("Chain contains no matching element");
		return result as T;
	}

	elementAt(index: number): T | undefined {
		if (index < 0) return undefined;
		let i = 0;
		for (const item of this.source) if (i++ === index) return item;
		return undefined;
	}

	aggregate<A>(seed: A, fn: (acc: A, item: T, index: number) => A): A {
		let acc = seed;
		let i = 0;
		for (const item of this.source) acc = fn(acc, item, i++);
		return acc;
	}

	sum(fn?: Selector<T, number>): number {
		let total = 0;
		let i = 0;
		for (const item of this.source) total += fn ? fn(item, i++) : item as unknown as number;
		return total;
	}

	/** `NaN` when empty. */
	average(fn?: Selector<T, number>): number {
		let total = 0;
		let n = 0;
		for (const item of this.source) {
			total += fn ? fn(item, n) : item as unknown as number;
			n++;
		}
		return n ? total / n : NaN;
	}

	/** Smallest item by `key` (defaults to the item); `undefined` when empty. */
	min<K = T>(key?: Selector<T, K>, compare: Comparer<K> = defaultCompare): T | undefined {
		return this.#extreme(key, compare, -1);
	}

	/** Largest item by `key` (defaults to the item); `undefined` when empty. */
	max<K = T>(key?: Selector<T, K>, compare: Comparer<K> = defaultCompare): T | undefined {
		return this.#extreme(key, compare, 1);
	}

	#extreme<K>(key: Selector<T, K> | undefined, compare: Comparer<K>, sign: 1 | -1): T | undefined {
		let best: T | undefined;
		let bestKey: K | undefined;
		let has = false;
		let i = 0;
		for (const item of this.source) {
			const k = key ? key(item, i) : item as unknown as K;
			i++;
			if (!has || compare(k, bestKey as K) * sign > 0) {
				best = item;
				bestKey = k;
				has = true;
			}
		}
		return best;
	}
}

/** A group produced by {@linkcode Chain.groupBy}: a chain of its members plus the `key` they share. */
export class Grouping<K, T> extends Chain<T> {
	readonly key: K;
	readonly #items: T[];

	constructor(key: K, items: T[]) {
		super(items);
		this.key = key;
		this.#items = items;
	}

	get length(): number {
		return this.#items.length;
	}

	override toArray(): T[] {
		return [...this.#items];
	}

	override count(fn?: (item: T) => boolean): number {
		return fn ? super.count(fn) : this.#items.length;
	}
}

interface SortLevel<T> {
	key: Selector<T, unknown>;
	// deno-lint-ignore no-explicit-any
	compare: Comparer<any>;
	sign: 1 | -1;
}

/** The result of `orderBy`; `thenBy` adds tie-breakers to the same single sort. */
export class OrderedChain<T> extends Chain<T> {
	readonly #origin: Iterable<T>;
	readonly #levels: SortLevel<T>[];

	constructor(origin: Iterable<T>, levels: SortLevel<T>[]) {
		super({ [Symbol.iterator]: () => sorted(origin, levels) });
		this.#origin = origin;
		this.#levels = levels;
	}

	thenBy<K>(key: Selector<T, K>, compare: Comparer<K> = defaultCompare): OrderedChain<T> {
		return new OrderedChain(this.#origin, [...this.#levels, { key, compare, sign: 1 }]);
	}

	thenByDescending<K>(key: Selector<T, K>, compare: Comparer<K> = defaultCompare): OrderedChain<T> {
		return new OrderedChain(this.#origin, [...this.#levels, { key, compare, sign: -1 }]);
	}
}

function* sorted<T>(source: Iterable<T>, levels: SortLevel<T>[]): Iterator<T> {
	const items = Array.from(source);
	const keys = levels.map((l) => items.map((item, i) => l.key(item, i)));
	const order = items.map((_, i) => i);
	order.sort((a, b) => {
		for (let l = 0; l < levels.length; l++) {
			const c = levels[l].compare(keys[l][a], keys[l][b]);
			if (c) return c * levels[l].sign;
		}
		return 0;
	});
	for (const i of order) yield items[i];
}
