import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "../signals/wrapper.ts";
import { createComputed } from "../signals.ts";
import { drain } from "../util/drain.ts";
import { borrowOwnership } from "../util/ownership.ts";

interface ShowProps {
	when: Signal.State<boolean> | Signal.Computed<boolean>;
	children: () => JSX.Element;
}

export function Show({ when: $, children }: ShowProps): Signal.Computed<JSX.Element | null> {
	return when($, children);
}

export function when(
	e: Signal.State<boolean> | Signal.Computed<boolean>,
	run: () => JSX.Element,
): Signal.Computed<JSX.Element | null> {
	const cleanups: (() => void)[] = [];
	let prevVal: boolean | undefined = undefined;
	let prevNode: JSX.Element | null = null;
	return createComputed(() => {
		const val = e.get();
		console.log(val, e);
		if (prevVal === val) return prevNode;
		drain(cleanups, (e) => e());
		prevVal = val;
		prevNode = borrowOwnership(
			{
				registerCleanup(e) {
					cleanups.push(e);
				},
			},
			() => val ? run() : null,
			() => drain(cleanups, (e) => e()),
		);
		return prevNode;
	});
}
