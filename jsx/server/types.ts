// deno-lint-ignore-file no-namespace
import type {
	MakeBaseProps,
	MakeChild,
	MakeChildren,
	MakeIntrinsicElements,
} from "../lib/types.ts";
import type { Html } from "../lib/html.ts";

export namespace JSX {
	export type Element = Html | Promise<Html>;
	export type Child = MakeChild;
	export type Children = MakeChildren;
	export type BaseProps = MakeBaseProps;
	export type IntrinsicElements = MakeIntrinsicElements;
	export interface ElementChildrenAttribute {
		children: unknown;
	}
	// deno-lint-ignore no-empty-interface
	export interface IntrinsicAttributes {}
}
