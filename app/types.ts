import type { Signal } from "./signals/wrapper.ts";

export type SignalOf<T> = Signal.Computed<T> | Signal.State<T>;
