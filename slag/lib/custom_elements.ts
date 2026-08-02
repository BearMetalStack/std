/**
 * Custom element registry and reaction dispatch.
 *
 * Slag keeps **one process-wide registry**, mirroring the browser's one-per-window
 * given that a Deno test process has a single global scope. Tests that define
 * elements should use unique tag names (or call {@linkcode resetCustomElements}
 * between cases) the same way they must in a browser — `define()` on an
 * already-defined tag is an error there too.
 *
 * This module deliberately has no runtime imports. Everything it touches is
 * duck-typed, which is what lets `node.ts` and `element.ts` both call into it
 * without an import cycle.
 */

import type { SlagElement } from "./element.ts";
import type { SlagNode } from "./node.ts";

/** The shape a class must have to be registered as a custom element. */
export interface CustomElementConstructorLike {
	// deno-lint-ignore no-explicit-any
	new (...args: any[]): SlagElement;
	observedAttributes?: readonly string[];
}

interface CustomElementInstance {
	connectedCallback?(): void;
	disconnectedCallback?(): void;
	attributeChangedCallback?(name: string, oldValue: string | null, value: string | null): void;
}

const registry = new Map<string, CustomElementConstructorLike>();
const pending = new Map<string, PromiseWithResolvers<CustomElementConstructorLike>>();

/**
 * The tag name `document.createElement` is currently building.
 *
 * A custom element constructor runs as `new Ctor()` with no arguments, so the
 * element has no way to learn its own tag from its parameters. The real DOM
 * resolves this from the "element being upgraded"; Slag does the same with this
 * one-slot stack, falling back to a reverse lookup of `new.target` in the
 * registry so that `new MyElement()` works standalone too.
 */
let constructingTag: string | undefined;

/** Runs `build` with `tag` visible to any custom element constructor it triggers. */
export function withConstructingTag<T>(tag: string, build: () => T): T {
	const previous = constructingTag;
	constructingTag = tag;
	try {
		return build();
	} finally {
		constructingTag = previous;
	}
}

/**
 * Resolves the tag name for an element being constructed without an explicit one
 * — either from the in-flight `createElement` call or from the constructor's
 * registry entry.
 */
export function resolveConstructingTag(ctor: unknown): string | undefined {
	if (constructingTag) return constructingTag;
	for (const [tag, registered] of registry) {
		if (registered === ctor) return tag;
	}
	return undefined;
}

/** The `customElements` global: a subset of `CustomElementRegistry`. */
export class SlagCustomElementRegistry {
	define(name: string, ctor: CustomElementConstructorLike): void {
		if (registry.has(name)) {
			throw new Error(`the name "${name}" has already been used with this registry`);
		}
		registry.set(name, ctor);
		pending.get(name)?.resolve(ctor);
		pending.delete(name);
	}

	get(name: string): CustomElementConstructorLike | undefined {
		return registry.get(name);
	}

	getName(ctor: CustomElementConstructorLike): string | null {
		for (const [name, registered] of registry) if (registered === ctor) return name;
		return null;
	}

	whenDefined(name: string): Promise<CustomElementConstructorLike> {
		const defined = registry.get(name);
		if (defined) return Promise.resolve(defined);
		const waiter = pending.get(name) ?? Promise.withResolvers<CustomElementConstructorLike>();
		pending.set(name, waiter);
		return waiter.promise;
	}

	/** Not a spec method. Clears the registry so test files can reuse tag names. */
	reset(): void {
		registry.clear();
		pending.clear();
	}
}

/** The single registry instance backing `globalThis.customElements`. */
export const customElementRegistry: SlagCustomElementRegistry = new SlagCustomElementRegistry();

/** Clears every registered custom element. Test-only escape hatch. */
export function resetCustomElements(): void {
	customElementRegistry.reset();
}

/** Fires `connectedCallback` on `node` and its subtree, in tree order. */
export function dispatchConnected(node: SlagNode): void {
	const el = node as unknown as CustomElementInstance;
	if (typeof el.connectedCallback === "function") el.connectedCallback();
	for (const child of [...node.childNodes]) dispatchConnected(child);
}

/** Fires `disconnectedCallback` on `node` and its subtree, in tree order. */
export function dispatchDisconnected(node: SlagNode): void {
	const el = node as unknown as CustomElementInstance;
	if (typeof el.disconnectedCallback === "function") el.disconnectedCallback();
	for (const child of [...node.childNodes]) dispatchDisconnected(child);
}

/**
 * Fires `attributeChangedCallback`, but only for attributes the element's class
 * listed in `observedAttributes` — the same gate the real DOM applies.
 */
export function dispatchAttributeChanged(
	element: SlagElement,
	name: string,
	oldValue: string | null,
	value: string | null,
): void {
	const instance = element as unknown as CustomElementInstance;
	if (typeof instance.attributeChangedCallback !== "function") return;
	const observed = (element.constructor as CustomElementConstructorLike).observedAttributes;
	if (!observed?.includes(name)) return;
	instance.attributeChangedCallback(name, oldValue, value);
}
