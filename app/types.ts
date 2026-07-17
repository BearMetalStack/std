import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "./signals/wrapper.ts";

export type SignalOf<T> = Signal.Computed<T> | Signal.State<T>;

export type BMTemplate =
	| JSX.Element
	| Signal.State<JSX.Element | null>
	| Signal.Computed<JSX.Element | null>
	| undefined;
