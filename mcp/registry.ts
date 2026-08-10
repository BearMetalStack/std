/**
 * @module
 * The keyed collection backing tools, resources, resource templates and
 * prompts. Entries can be toggled at runtime or hidden per-client, and every
 * mutation that changes what a client would see fires `onChange` so the server
 * can emit the matching `.../list_changed` notification.
 */

import type { RegistrationOptions, VisibilityContext } from "./types.ts";

export interface RegistryEntry<T> {
	readonly key: string;
	readonly value: T;
	enabled: boolean;
	readonly visible?: (ctx: VisibilityContext) => boolean;
}

/** A keyed, order-preserving collection of registrations. */
export class Registry<T> implements Iterable<T> {
	readonly #entries = new Map<string, RegistryEntry<T>>();
	readonly #label: string;
	readonly #keyOf: (value: T) => string;
	#onChange: (() => void) | undefined;

	/**
	 * @param label Used in duplicate-registration errors, e.g. `"tool"`.
	 * @param keyOf Extracts the unique key — a name for tools, a uri for resources.
	 */
	constructor(label: string, keyOf: (value: T) => string) {
		this.#label = label;
		this.#keyOf = keyOf;
	}

	/** Called after any mutation that could change a client-visible listing. */
	set onChange(handler: (() => void) | undefined) {
		this.#onChange = handler;
	}

	/**
	 * Register an entry. Throws when the key is already taken — use
	 * {@linkcode Registry.set} to replace deliberately.
	 */
	add(value: T, options: RegistrationOptions = {}): this {
		const key = this.#keyOf(value);
		if (this.#entries.has(key)) {
			throw new Error(`Duplicate ${this.#label}: ${key}`);
		}
		return this.set(value, options);
	}

	/** Register an entry, replacing any existing one with the same key. */
	set(value: T, options: RegistrationOptions = {}): this {
		const key = this.#keyOf(value);
		this.#entries.set(key, {
			key,
			value,
			enabled: options.enabled ?? true,
			visible: options.visible,
		});
		this.#onChange?.();
		return this;
	}

	remove(key: string): boolean {
		const removed = this.#entries.delete(key);
		if (removed) this.#onChange?.();
		return removed;
	}

	clear(): void {
		if (this.#entries.size === 0) return;
		this.#entries.clear();
		this.#onChange?.();
	}

	/** The registration regardless of whether it is currently enabled. */
	get(key: string): T | undefined {
		return this.#entries.get(key)?.value;
	}

	entry(key: string): RegistryEntry<T> | undefined {
		return this.#entries.get(key);
	}

	has(key: string): boolean {
		return this.#entries.has(key);
	}

	/** Total registrations, including disabled ones. */
	get size(): number {
		return this.#entries.size;
	}

	keys(): string[] {
		return [...this.#entries.keys()];
	}

	/**
	 * Toggle an entry. A disabled entry is hidden from listings and refuses
	 * invocation, but keeps its registration.
	 */
	setEnabled(key: string, enabled: boolean): boolean {
		const entry = this.#entries.get(key);
		if (!entry || entry.enabled === enabled) return false;
		entry.enabled = enabled;
		this.#onChange?.();
		return true;
	}

	enable(key: string): boolean {
		return this.setEnabled(key, true);
	}

	disable(key: string): boolean {
		return this.setEnabled(key, false);
	}

	isEnabled(key: string): boolean {
		return this.#entries.get(key)?.enabled ?? false;
	}

	/** Is this entry both enabled and visible to the given client? */
	isAvailable(key: string, ctx: VisibilityContext): boolean {
		const entry = this.#entries.get(key);
		if (!entry || !entry.enabled) return false;
		return entry.visible ? entry.visible(ctx) === true : true;
	}

	/** The entry if it is available to this client, otherwise `undefined`. */
	resolve(key: string, ctx: VisibilityContext): T | undefined {
		return this.isAvailable(key, ctx) ? this.#entries.get(key)!.value : undefined;
	}

	/** Every entry available to this client, in registration order. */
	available(ctx: VisibilityContext): T[] {
		const out: T[] = [];
		for (const entry of this.#entries.values()) {
			if (!entry.enabled) continue;
			if (entry.visible && entry.visible(ctx) !== true) continue;
			out.push(entry.value);
		}
		return out;
	}

	/** Do any registrations exist at all, enabled or not? */
	get isEmpty(): boolean {
		return this.#entries.size === 0;
	}

	*[Symbol.iterator](): IterableIterator<T> {
		for (const entry of this.#entries.values()) yield entry.value;
	}
}
