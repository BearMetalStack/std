import { Signal } from "@bearmetal/app/signals";
import { evaluate, values } from "./evaluate.ts";
import { parse } from "./parser.ts";
import type { EvaluateOptions, Location, Query } from "./types.ts";

/**
 * A `Signal.Computed` of `evaluate(root, query, options)`. The query is
 * parsed up front, so a syntax error throws here rather than on first read.
 *
 * It recomputes only when a signal the last evaluation read changes, and
 * reports a change only when the resulting locations differ, so dependents
 * are not woken by a write that left the result as it was.
 */
export function compute(
	root: unknown,
	query: string | Query,
	options?: EvaluateOptions,
): Signal.Computed<Location[]> {
	const parsed = typeof query === "string" ? parse(query) : query;
	return new Signal.Computed(() => evaluate(root, parsed, options), { equals: sameLocations });
}

/** `compute`, holding only the values. */
export function computeValues(
	root: unknown,
	query: string | Query,
	options?: EvaluateOptions,
): Signal.Computed<unknown[]> {
	const parsed = typeof query === "string" ? parse(query) : query;
	return new Signal.Computed(() => values(root, parsed, options), { equals: sameValues });
}

function sameLocations(a: Location[], b: Location[]): boolean {
	return a.length === b.length &&
		a.every((location, i) =>
			Object.is(location.value, b[i].value) &&
			location.parent === b[i].parent &&
			location.key === b[i].key &&
			location.cell === b[i].cell
		);
}

function sameValues(a: unknown[], b: unknown[]): boolean {
	return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}
