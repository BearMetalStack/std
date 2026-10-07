import { Signal } from "@bearmetal/app/signals";

/**
 * Reads through `Signal.State` and `Signal.Computed`, nested ones included,
 * and returns anything else as it is. This is `evaluate`'s default `unwrap`,
 * so a query run inside a `Signal.Computed` (or an effect) subscribes to
 * exactly the signals it read on the way to its result.
 */
export function unwrapSignal(value: unknown): unknown {
	while (
		value !== null && typeof value === "object" &&
		(Signal.isState(value) || Signal.isComputed(value))
	) {
		value = (value as Signal.State<unknown>).get();
	}
	return value;
}
