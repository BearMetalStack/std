import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "../signals/wrapper.ts";
import { createComputed } from "../signals.ts";

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
	return createComputed(() => e.get() ? run() : null);
}
