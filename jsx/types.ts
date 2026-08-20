// deno-lint-ignore-file no-namespace
import type { MakeBaseProps, MakeChild, MakeChildren, MakeIntrinsicElements } from "./lib/types.ts";
import type { BMC } from "./lib/bmc.ts";

type SignalLike<T = unknown> = { get(): T };

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
	export type IntrinsicElements = MakeIntrinsicElements<SignalLike>;
	// deno-lint-ignore no-explicit-any
	export type ElementType = string | typeof BMC | ((props: any) => any);
	export interface ElementChildrenAttribute {
		children: unknown;
	}
	// deno-lint-ignore no-empty-interface
	export interface IntrinsicAttributes {}
}
