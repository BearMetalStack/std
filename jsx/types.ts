// deno-lint-ignore-file no-namespace
import type { MakeBaseProps, MakeChild, MakeChildren, MakeIntrinsicElements } from "./lib/types.ts";
import type { BMC } from "./lib/bmc.ts";

type SignalLike<T = unknown> = { get(): T };

/**
 * Props every element accepts, beyond the ones HTML defines — open for
 * extension.
 *
 * A library that claims a prop with `registerPropHandler()` declares its type
 * here, by merging into this interface from its own module:
 *
 * ```ts
 * declare module "@bearmetal/jsx/types" {
 * 	interface CustomProps {
 * 		contextMenu?: MenuSpec;
 * 	}
 * }
 * ```
 *
 * The merge reaches every intrinsic element and every component, because this
 * is what their prop types are built from. Keep the members optional: they are
 * added to tags that know nothing about them.
 *
 * Signal-valued props are the caller's choice, so a prop that a handler is
 * happy to receive reactively should say so in its own type
 * (`contextMenu?: MenuSpec | SignalLike<MenuSpec>`) — nothing widens it here.
 */
// deno-lint-ignore no-empty-interface
export interface CustomProps {}

export namespace JSX {
	/**
	 * What the runtime produces: a node.
	 *
	 * Always a real one — this is the point of having a single runtime — so
	 * `container.appendChild(<div />)` type-checks, on a server as much as in a
	 * browser. A `DocumentFragment` counts: `<>…</>`, `each()` and `<For>` all
	 * produce one, and inserting it splices its contents in with no wrapper
	 * element. A promise is a node that has not arrived yet; the runtime holds a
	 * slot for it and a server render waits before serializing.
	 *
	 * Deliberately *not* `Html`, and not a promise. Both are perfectly good
	 * children — see {@linkcode JSX.Child} — but neither is a node, and every
	 * JSX expression is typed as this one regardless of what tag produced it. A
	 * union covering the two things only an `async` function component can
	 * return would put a cast in front of every `appendChild`.
	 */
	export type Element = globalThis.Element | globalThis.DocumentFragment;
	export type Child = MakeChild<SignalLike>;
	export type Children = MakeChildren<SignalLike>;
	export type BaseProps = MakeBaseProps<SignalLike>;
	/**
	 * The tags that may be written directly in JSX.
	 *
	 * An interface, not an alias, so a library can type a tag of its own by
	 * merging into it. Unknown tags are already permitted — the underlying map
	 * has a string index signature — so merging is about giving a tag real props,
	 * not about being allowed to use it.
	 */
	export interface IntrinsicElements extends MakeIntrinsicElements<SignalLike> {}
	// deno-lint-ignore no-explicit-any
	export type ElementType = string | typeof BMC | ((props: any) => any);
	export interface ElementChildrenAttribute {
		children: unknown;
	}
	// deno-lint-ignore no-empty-interface
	export interface IntrinsicAttributes {}
}
