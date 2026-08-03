// deno-lint-ignore-file no-namespace
import type { MakeBaseProps, MakeChild, MakeChildren, MakeIntrinsicElements } from "./lib/types.ts";
import type { Html } from "./lib/html.ts";
import type { BMC } from "./lib/bmc.ts";

type SignalLike<T = unknown> = { get(): T };

export namespace JSX {
	/**
	 * What a component may return.
	 *
	 * A `DocumentFragment` counts: `<>…</>`, `each()` and `<For>` all produce
	 * one, and inserting it splices its contents in without a wrapper element.
	 * `Html` is pre-escaped markup passing through untouched. A promise is a
	 * value that has not arrived yet — the runtime holds a slot for it, and a
	 * server render waits for it before serializing.
	 */
	export type Element =
		| globalThis.Element
		| globalThis.DocumentFragment
		| Html
		| Promise<globalThis.Element | globalThis.DocumentFragment | Html>;
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
