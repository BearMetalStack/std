import { Signal } from "@signals";

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
const METADATA: symbol = (Symbol as { metadata?: symbol }).metadata ?? Symbol.for("Symbol.metadata");

/** Minimal shape `@prop` needs from the class it decorates. */
export type PropHost = {
	signals: Record<string, Signal.State<unknown>>;
};

/** The accessor decorator returned by `prop()`. */
export type PropDecorator = <This extends PropHost, T>(
	target: ClassAccessorDecoratorTarget<This, T>,
	context: ClassAccessorDecoratorContext<This, T>,
) => ClassAccessorDecoratorResult<This, T>;

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
 * The accessor reads and writes `this.signals.$<name>`, the same bag SSR fills
 * from `data-server-props`, so a prop is a signal from the moment it exists.
 * Declaring a prop also adds it to `observedAttributes`: when a parent writes
 * the corresponding attribute — which is what the JSX runtime does for strings,
 * numbers, and booleans — the signal updates and anything reading it re-renders.
 *
 * The type is inferred from the initializer. Pass one explicitly when the
 * initializer can't carry it, e.g. `@prop(Number) accessor count = undefined`.
 *
 * Object-valued props are set as properties rather than attributes, so they are
 * never observed. Pass a signal if you need to watch one.
 *
 * @example
 * ```tsx
 * @define("my-counter")
 * class MyCounter extends BMElement {
 *   @prop() accessor count = 0;
 *   @prop() accessor label = "Count";
 *
 *   get template() {
 *     return <p>{this.label}: {this.signals.$count}</p>;
 *   }
 * }
 * ```
 */
export function prop(type?: PropType): PropDecorator {
	return function <This extends PropHost, T>(
		_target: ClassAccessorDecoratorTarget<This, T>,
		context: ClassAccessorDecoratorContext<This, T>,
	): ClassAccessorDecoratorResult<This, T> {
		const name = String(context.name);
		const key = `$${name}`;
		// Give this class its own declarations rather than inheriting the parent's
		// object, which a subclass's `@prop` would otherwise write into.
		if (!Object.hasOwn(context.metadata, PROPS)) context.metadata[PROPS] = {};
		const declared = context.metadata[PROPS] as DeclaredProps;
		declared[name] = type;

		return {
			init(this: This, value: T): T {
				// Base-class fields initialize first, so `signals` is already here.
				this.signals[key] ??= new Signal.State(value as unknown);
				declared[name] ??= inferType(value);
				return value;
			},
			get(this: This): T {
				return this.signals[key].get() as T;
			},
			set(this: This, value: T) {
				this.signals[key].set(value as unknown);
			},
		};
	};
}
