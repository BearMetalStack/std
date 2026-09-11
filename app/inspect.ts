import type { Signal as Signals } from "@signals";
import { Signal } from "@signals";
import type { SignalBinding } from "./types.ts";

const INSPECT: unique symbol = Symbol.for("bearmetal.inspect");

/**
 * The decorator-metadata proposal ships separately from the base decorators
 * proposal, and some engines implement the latter without the former. See the
 * matching note in `./state.ts`/`./prop.ts` — reads must use the same
 * fallback key that down-level decorator transforms write to.
 */
const METADATA: symbol = (Symbol as { metadata?: symbol }).metadata ??
	Symbol.for("Symbol.metadata");

/**
 * The accessor decorator returned by {@linkcode inspect}.
 *
 * Generic over the whole signal type `S`, not decomposed into a value type
 * `T` reassembled into `State<T> | Computed<T>` — an accessor decorator's
 * target/context/result must all share one concrete `Value` type, and a
 * union rebuilt from a separately-inferred `T` doesn't unify with the
 * accessor's actual, narrower declared type (`State<number>`, say).
 */
export type InspectDecorator = <This, S extends Signals.State<unknown> | Signals.Computed<unknown>>(
	target: ClassAccessorDecoratorTarget<This, S>,
	context: ClassAccessorDecoratorContext<This, S>,
) => ClassAccessorDecoratorResult<This, S>;

type BindingFactory = (instance: object) => SignalBinding;

/**
 * As of Deno 2.9.6 (V8 15.0.245, bundling swc for the decorators transform),
 * `context.access.get`/`.set` throw on a true `#private` accessor field —
 * "Cannot read/write private member ... from an object whose class did not
 * declare it" — even though the very same class's own methods read that
 * field without issue. This is an open swc bug, not anything specific to
 * this decorator: https://github.com/swc-project/swc/issues/8557. Confirmed
 * with a bare repro outside this codebase; public and TS-private accessor
 * fields are unaffected.
 *
 * A binding that hits this is not dropped — the field really was declared
 * `@inspect()`, so its name should still show up under introspection — but
 * `get`/`set` throw a message actually pointing at the cause instead of the
 * raw V8 error, since nothing in userland can route around this from either
 * side of the decorator boundary. Revisit once the linked issue lands.
 */
function brokenPrivateBinding(name: string, cause: unknown): SignalBinding {
	const message =
		`@inspect() cannot reach "${name}": Deno's decorator transform (swc) cannot read a ` +
		`true #private accessor field through context.access — open bug ` +
		`https://github.com/swc-project/swc/issues/8557. Use a public or TS-private accessor ` +
		`instead until that's fixed.`;
	return {
		name,
		readonly: true,
		get(): never {
			throw new Error(message, { cause });
		},
		set(): never {
			throw new Error(message, { cause });
		},
	};
}

/**
 * Reads the binding factories declared on a class and its ancestors.
 *
 * Unlike `declaredState`/`declaredProps`, entries are concatenated, not
 * deduplicated by name: each factory closes over one specific field's
 * storage via `context.access`, captured at decoration time. A parent and a
 * subclass each declaring `@inspect() accessor #x` are two distinct private
 * names with two distinct storage slots — deduplicating by display name
 * would silently drop a real, independent signal.
 *
 * Walks the constructor chain rather than trusting the metadata object's
 * prototype, for the same reason `declaredState`/`declaredProps` do: each
 * class owns its own declarations, and a subclass must never write into its
 * parent's.
 */
export function declaredInspectable(ctor: unknown): BindingFactory[] {
	const factories: BindingFactory[] = [];
	// deno-lint-ignore no-explicit-any
	for (let c: any = ctor; typeof c === "function"; c = Object.getPrototypeOf(c)) {
		const own = Object.getOwnPropertyDescriptor(c, METADATA)?.value?.[INSPECT] as
			| BindingFactory[]
			| undefined;
		if (!own) continue;
		factories.push(...own);
	}
	return factories;
}

/**
 * Exposes a signal to devtools introspection.
 *
 * Intended to work on public, TS-private, and true `#private` accessor
 * fields alike: `context.access.get`/`.set` are meant to reach the
 * accessor's storage directly, because the decorator runs inside the class
 * body's evaluation, which has lexical access to the private name
 * regardless of what calls the decorator later — no bracket-notation lookup
 * for `#private` to defeat.
 *
 * A currently-open bug in Deno's decorator transform means the `#private`
 * case doesn't actually work yet — see {@linkcode brokenPrivateBinding}'s
 * comment for the tracked issue. A binding on a `#private` field still shows
 * up under its name, but `get()`/`set()` throw a message pointing at the
 * upstream bug rather than crashing the whole component's introspection.
 * Public and TS-private accessor fields are unaffected.
 *
 * This is a separate, explicit opt-in from `@state()`/`@prop()` — compose
 * them (`@prop() @inspect() accessor count = this.signal(0)`) when a field
 * should be both persisted state and inspectable. `@state()`/`@prop()` are
 * not automatically inspectable: both retrieve their signal later via a
 * bracket lookup keyed by name, which already silently fails for a private
 * field, and reusing that path here would reproduce the exact silent-gap
 * failure this decorator exists to avoid.
 *
 * @example
 * ```tsx
 * @define("counter")
 * class Counter extends BMElement {
 *   @inspect() accessor count = this.signal(0);
 *
 *   get template() {
 *     return <button onClick={() => this.count.set(this.count.get() + 1)}>
 *       {this.count}
 *     </button>;
 *   }
 * }
 * ```
 */
export function inspect(): InspectDecorator {
	return function <This, S extends Signals.State<unknown> | Signals.Computed<unknown>>(
		_target: ClassAccessorDecoratorTarget<This, S>,
		context: ClassAccessorDecoratorContext<This, S>,
	): ClassAccessorDecoratorResult<This, S> {
		const name = String(context.name);

		if (!Object.hasOwn(context.metadata, INSPECT)) context.metadata[INSPECT] = [];
		(context.metadata[INSPECT] as BindingFactory[]).push((instance) => {
			let signal: S;
			try {
				signal = context.access.get(instance as This);
			} catch (cause) {
				return brokenPrivateBinding(name, cause);
			}
			const readonly = !(signal instanceof Signal.State);
			return {
				name,
				readonly,
				get: () => signal.get(),
				set: (value: unknown) => {
					if (!readonly) (signal as Signals.State<unknown>).set(value);
				},
			};
		});
		return {};
	};
}
