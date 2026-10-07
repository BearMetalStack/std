import { Signal } from "@bearmetal/app/signals";
import type { Location } from "./types.ts";

/**
 * Writes through query locations as one batch.
 *
 * Signal-held data is never mutated: a write copies each container between
 * the target and the nearest `Signal.State` above it, then sets that signal,
 * so anything comparing by identity (a `Signal.Computed`, `each()`) sees the
 * change. Data with no signal above it is changed in place. Each container is
 * copied at most once per batch, so several writes under one array land in the
 * same copy rather than overwriting each other.
 */
export class WriteBatch {
	#copies = new Map<object, object>();
	#removals = new Map<unknown[], Set<number>>();
	#before = new Map<Signal.State<unknown>, unknown>();

	/** Replaces the value at `location`. */
	set(location: Location, value: unknown): void {
		if (location.cell !== undefined) {
			this.#setCell(location.cell, value);
			return;
		}
		if (!location.parent || location.key === undefined) {
			throw new Error("bmql: the root of a query cannot be written to");
		}
		const container = this.#writable(location);
		if (container instanceof Map) container.set(location.key, value);
		else (container as Record<string | number, unknown>)[location.key] = value;
	}

	/** Removes the value at `location` from its container. Array removals apply at `commit`. */
	remove(location: Location): void {
		if (!location.parent || location.key === undefined) {
			throw new Error("bmql: the root of a query cannot be removed");
		}
		const container = this.#writable(location);
		if (Array.isArray(container)) {
			const indices = this.#removals.get(container) ?? new Set();
			indices.add(location.key as number);
			this.#removals.set(container, indices);
		} else if (container instanceof Map) {
			container.delete(location.key);
		} else {
			delete (container as Record<string | number, unknown>)[location.key];
		}
	}

	/** Every signal this batch has set, with the value it held before. */
	get changed(): ReadonlyMap<Signal.State<unknown>, unknown> {
		return this.#before;
	}

	/** Applies pending array removals. */
	commit(): void {
		for (const [array, indices] of this.#removals) {
			for (const index of [...indices].sort((a, b) => b - a)) array.splice(index, 1);
		}
		this.#removals.clear();
	}

	/** Puts every signal this batch set back to its previous value. In-place writes stay. */
	rollback(): void {
		for (const [cell, value] of this.#before) cell.set(value);
		this.#before.clear();
	}

	#setCell(cell: unknown, value: unknown) {
		if (!isState(cell)) {
			throw new Error("bmql: cannot write through a value that is not a Signal.State");
		}
		if (!this.#before.has(cell)) this.#before.set(cell, cell.get());
		cell.set(value);
	}

	#writable(location: Location): object {
		const original = location.parent!;
		const known = this.#copies.get(original);
		if (known) return known;
		if (!location.up || !hasStateAbove(location.up)) {
			this.#copies.set(original, original);
			return original;
		}
		const copy = clone(original);
		this.#copies.set(original, copy);
		this.set(location.up, copy);
		return copy;
	}
}

function isState(value: unknown): value is Signal.State<unknown> {
	return value !== null && typeof value === "object" && Signal.isState(value);
}

function hasStateAbove(location: Location | undefined): boolean {
	for (let at = location; at; at = at.up) {
		if (at.cell !== undefined) return true;
	}
	return false;
}

function clone(container: object): object {
	if (Array.isArray(container)) return container.slice();
	if (container instanceof Map) return new Map(container);
	return Object.assign(Object.create(Object.getPrototypeOf(container)), container);
}
