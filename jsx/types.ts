// deno-lint-ignore-file no-namespace
import type { MakeBaseProps, MakeChild, MakeChildren, MakeIntrinsicElements } from "./lib/types.ts";
import type { Html } from "./lib/html.ts";

type SignalLike<T = unknown> = { get(): T };

export namespace JSX {
	export type Element = globalThis.Element | Html | Promise<globalThis.Element | Html>;
	export type Child = MakeChild<SignalLike>;
	export type Children = MakeChildren<SignalLike>;
	export type BaseProps = MakeBaseProps<SignalLike>;
	export type IntrinsicElements = MakeIntrinsicElements<SignalLike>;
	export interface ElementChildrenAttribute {
		children: unknown;
	}
	// deno-lint-ignore no-empty-interface
	export interface IntrinsicAttributes {}
}
