/**
 * Late binding to the ambient DOM.
 *
 * `BMC` has to extend `HTMLElement`, and `extends` is evaluated once, when the
 * class is defined. That used to make import order load-bearing: a module that
 * reached `BMC` before a microdom was installed got a class extending a bare
 * `Object`, and the failure surfaced much later as `node.contains is not a
 * function`. A `.tsx` file could not win at all, because the JSX transform
 * injects its runtime import above everything the source writes.
 *
 * So the base class is not captured — it is *re-pointed*. A class's prototype
 * chain is two mutable links (`Ctor.[[Prototype]]` and
 * `Ctor.prototype.[[Prototype]]`), and rewriting them retargets the whole
 * hierarchy at once: subclasses chain through `BMC.prototype`, so they follow
 * without knowing anything happened. Instances follow too, since the prototype
 * objects are mutated in place rather than replaced.
 *
 * Whoever installs the globals announces it by calling the hooks parked on
 * {@linkcode DOM_REBASE_HOOKS}. That is a global symbol rather than an import so
 * the DOM implementation never has to depend on this package — and so two
 * separately bundled copies of this module still share one hook set.
 */

// deno-lint-ignore no-explicit-any
export type ElementBase = abstract new (...args: any[]) => any;

/**
 * `globalThis[DOM_REBASE_HOOKS]` is a `Set<() => void>`. A DOM implementation
 * calls every hook in it right after installing or removing its globals.
 *
 * @see {@linkcode rebaseOnDom}
 */
export const DOM_REBASE_HOOKS: unique symbol = Symbol.for("bearmetal.dom.rebaseHooks");

/** The base `BMC` extends before any DOM exists. Deliberately empty. */
export class DetachedElement {}

function hooks(): Set<() => void> {
	// deno-lint-ignore no-explicit-any
	const global = globalThis as any;
	return global[DOM_REBASE_HOOKS] ??= new Set<() => void>();
}

/** The ambient `HTMLElement`, or {@linkcode DetachedElement} when there is none. */
export function currentElementBase(): ElementBase {
	// deno-lint-ignore no-explicit-any
	return (globalThis as any).HTMLElement ?? DetachedElement;
}

/**
 * Points `target`'s prototype chain at the ambient `HTMLElement`, and keeps it
 * pointed there as the globals change.
 *
 * Call this once, immediately after declaring the class. It is safe to call
 * before a DOM exists — that is the whole point — and safe to call when one
 * already does.
 */
export function rebaseOnDom(target: ElementBase): void {
	const apply = () => {
		const base = currentElementBase();
		if (Object.getPrototypeOf(target) === base) return;
		Object.setPrototypeOf(target, base);
		Object.setPrototypeOf(
			(target as { prototype: object }).prototype,
			(base as unknown as { prototype: object }).prototype,
		);
	};
	apply();
	hooks().add(apply);
}

/**
 * Announces that the DOM globals changed.
 *
 * Exported for completeness; the implementations that matter (a browser, which
 * never changes, and `@bearmetal/slag`, which must not import this package)
 * reach the hook set through {@linkcode DOM_REBASE_HOOKS} directly.
 */
export function notifyDomChanged(): void {
	for (const hook of hooks()) hook();
}
