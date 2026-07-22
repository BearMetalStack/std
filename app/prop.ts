import type { Signal } from "@signals";

/** The attribute types a declared prop can be coerced back from. */
export type PropType = typeof String | typeof Number | typeof Boolean;

const PROPS: unique symbol = Symbol.for("bearmetal.props");

/**
 * The decorator-metadata proposal is a separate addition on top of the base
 * decorators proposal, and some engines (this includes at least one shipping
 * Chromium build) implement the latter without the former: `Symbol.metadata`
 * comes back `undefined` even though decorators themselves run fine. Down-level
 * decorator transforms (esbuild's included, which is what `deno bundle`
 * produces) already handle this by falling back to `Symbol.for("Symbol.metadata")`
 * when writing `ctor[Symbol.metadata]` — so reads must use the same fallback,
 * or they query a key nothing ever wrote to.
 */
const METADATA: symbol = (Symbol as { metadata?: symbol }).metadata ??
	Symbol.for("Symbol.metadata");

/**
 * The accessor decorator returned by `prop()`.
 *
 * Target and result share the same `Signal.State<T>` value — a decorator
 * cannot change an accessor's type to something the field itself isn't
 * already declared as, so the field must be initialized with a signal
 * (`accessor count = this.signal(0)`), not a bare value.
 */
export type PropDecorator = <This, T>(
	target: ClassAccessorDecoratorTarget<This, Signal.State<T>>,
	context: ClassAccessorDecoratorContext<This, Signal.State<T>>,
) => ClassAccessorDecoratorResult<This, Signal.State<T>>;

type DeclaredProps = Record<string, PropType | undefined>;

/**
 * Reads the props declared on a class and its ancestors.
 *
 * Each class owns its own declarations, so the constructor chain is walked and
 * merged rather than relying on the metadata object's prototype: `Object.keys`
 * would not see inherited entries, and a subclass must never write into its
 * parent's declarations.
 */
export function declaredProps(ctor: unknown): DeclaredProps {
	const merged: DeclaredProps = {};
	// deno-lint-ignore no-explicit-any
	for (let c: any = ctor; typeof c === "function"; c = Object.getPrototypeOf(c)) {
		const own = Object.getOwnPropertyDescriptor(c, METADATA)?.value?.[PROPS];
		if (!own) continue;
		for (const [name, type] of Object.entries(own as DeclaredProps)) merged[name] ??= type;
	}
	return merged;
}

function inferType(value: unknown): PropType | undefined {
	switch (typeof value) {
		case "number":
			return Number;
		case "boolean":
			return Boolean;
		case "string":
			return String;
		default:
			return undefined;
	}
}

/** Turns an attribute value back into the prop's declared type. */
export function coerceProp(type: PropType, value: string | null): unknown {
	switch (type) {
		// An attribute is either present or it isn't; `disabled=""` is `true`.
		case Boolean:
			return value !== null;
		case Number:
			return value === null ? 0 : Number(value);
		default:
			return value ?? "";
	}
}

/**
 * Declares a reactive prop.
 *
 * The accessor *is* the signal: `@prop() accessor count = this.signal(0)`
 * makes `this.count` a `Signal.State<number>` directly, usable anywhere a
 * bare signal is — template children, `each()`, effects — with no `.signals`
 * indirection to reach through. Declaring a prop also adds it to
 * `observedAttributes`: when a parent writes the corresponding attribute —
 * which is what the JSX runtime does for strings, numbers, and booleans —
 * the signal updates and anything reading it re-renders.
 *
 * The type is inferred from the signal's initial value. Pass one explicitly
 * when that value can't carry it, e.g.
 * `@prop(Number) accessor count = this.signal(undefined)`.
 *
 * Object-valued props are set as properties rather than attributes, so they
 * are never observed via `observedAttributes` — but as a signal, `count` is
 * still watchable regardless of value type.
 *
 * Passing a signal itself as the prop value (`<my-counter count={parentSignal} />`)
 * is different from passing its current value: the JSX runtime (`applyProps` in
 * `jsx/lib/jsx.ts`) sees that `count`'s accessor already holds a writable signal
 * and swaps it for the incoming one instead of mirroring through an attribute.
 * Parent and child then read and write the exact same `Signal.State` — the
 * binding is bidirectional because there is only one signal, not two kept in
 * sync. This only fires when the incoming value is itself a signal; a bare
 * value still flows one-way through the attribute as above.
 *
 * @example
 * ```tsx
 * @define("my-counter")
 * class MyCounter extends BMElement {
 *   @prop() accessor count = this.signal(0);
 *   @prop() accessor label = this.signal("Count");
 *
 *   get template() {
 *     return <p>{this.label}: {this.count}</p>;
 *   }
 * }
 * ```
 */
export function prop(type?: PropType): PropDecorator {
	return function <This, T>(
		_target: ClassAccessorDecoratorTarget<This, Signal.State<T>>,
		context: ClassAccessorDecoratorContext<This, Signal.State<T>>,
	): ClassAccessorDecoratorResult<This, Signal.State<T>> {
		const name = String(context.name);
		// Give this class its own declarations rather than inheriting the parent's
		// object, which a subclass's `@prop` would otherwise write into.
		if (!Object.hasOwn(context.metadata, PROPS)) context.metadata[PROPS] = {};
		const declared = context.metadata[PROPS] as DeclaredProps;
		declared[name] = type;
		return {
			// get/set are intentionally omitted: the field's own initializer is
			// already a Signal.State, so the auto-accessor's default storage is
			// the signal itself — no redirection needed.
			init(value: Signal.State<T>): Signal.State<T> {
				declared[name] ??= inferType(value.get());
				return value;
			},
		};
	};
}
