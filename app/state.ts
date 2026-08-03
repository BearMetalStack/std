import type { Signal } from "@signals";

const STATE: unique symbol = Symbol.for("bearmetal.state");

/**
 * The decorator-metadata proposal ships separately from the base decorators
 * proposal, and some engines implement the latter without the former. See the
 * matching note in `./prop.ts` — reads must use the same fallback key that
 * down-level decorator transforms write to.
 */
const METADATA: symbol = (Symbol as { metadata?: symbol }).metadata ??
	Symbol.for("Symbol.metadata");

/** The accessor decorator returned by {@linkcode state}. */
export type StateDecorator = <This, T>(
	target: ClassAccessorDecoratorTarget<This, Signal.State<T>>,
	context: ClassAccessorDecoratorContext<This, Signal.State<T>>,
) => ClassAccessorDecoratorResult<This, Signal.State<T>>;

/**
 * Reads the state fields declared on a class and its ancestors.
 *
 * Walks the constructor chain rather than trusting the metadata object's
 * prototype, for the reason spelled out in `declaredProps`: each class owns its
 * own declarations, `Object.keys` would not see inherited ones, and a subclass
 * must never write into its parent's.
 */
export function declaredState(ctor: unknown): string[] {
	const names: string[] = [];
	// deno-lint-ignore no-explicit-any
	for (let c: any = ctor; typeof c === "function"; c = Object.getPrototypeOf(c)) {
		const own = Object.getOwnPropertyDescriptor(c, METADATA)?.value?.[STATE] as
			| Set<string>
			| undefined;
		if (!own) continue;
		for (const name of own) if (!names.includes(name)) names.push(name);
	}
	return names;
}

/**
 * Marks a signal as part of the component's serializable state.
 *
 * This is what carries a server render across to the browser. After
 * `serverInit()` has settled, the renderer reads every `@state` signal on every
 * component in the tree and writes the values into the element's markup; when
 * that element upgrades in the browser it reads them back into the same signals
 * before rendering. The client picks up where the server left off instead of
 * re-fetching what the server already had.
 *
 * The values are hydrated **into the signals themselves**, so a component's
 * state is reachable the way it always was — `this.rows`, not a `signals` bag
 * keyed by string. Anything that survives `JSON.stringify` can be state;
 * anything that cannot (a `Map`, a class instance, a function) should be
 * derived in `init()` from something that can.
 *
 * @example
 * ```tsx
 * @define("user-card")
 * class UserCard extends BMElement {
 *   @prop() accessor userId = this.signal("");
 *   @state() accessor user = this.signal<User | null>(null);
 *
 *   override async serverInit() {
 *     this.user.set(await db.user(this.userId.get()));
 *   }
 *
 *   get template() {
 *     return <h2>{this.computed(() => this.user.get()?.name ?? "…")}</h2>;
 *   }
 * }
 * ```
 */
export function state(): StateDecorator {
	return function <This, T>(
		_target: ClassAccessorDecoratorTarget<This, Signal.State<T>>,
		context: ClassAccessorDecoratorContext<This, Signal.State<T>>,
	): ClassAccessorDecoratorResult<This, Signal.State<T>> {
		if (!Object.hasOwn(context.metadata, STATE)) context.metadata[STATE] = new Set<string>();
		(context.metadata[STATE] as Set<string>).add(String(context.name));
		return {};
	};
}
