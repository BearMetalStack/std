import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "../signals/wrapper.ts";
import { createComputed } from "../signals.ts";

interface SwitchProps<T> {
	$: Signal.State<T> | Signal.Computed<T>;
	children: CaseTuple<T> | CaseTuple<T>[];
}

export function Switch<T>({ $, children }: SwitchProps<T>): JSX.Element {
	const map = new Map<T, CaseRenderer>();
	const evaluators: [CaseEval<T>, CaseTuple<T>["renderer"]][] = [];
	if (!Array.isArray(children)) children = [children];
	for (const child of children) {
		// if (!Array.isArray(child)) {
		// 	evaluators.push([() => true, child as CaseRenderer]);
		// 	continue;
		// }
		if (typeof child.$ === "function") evaluators.push([child.$ as CaseEval<T>, child.renderer]);
		else map.set(child.$, child.renderer);
	}
	const s = createComputed(() => {
		const val = $.get();
		let renderer = map.get(val);
		for (const [evalFn, child] of evaluators) {
			if (evalFn(val)) {
				renderer = child;
				break;
			}
		}
		return renderer?.() ?? null;
	});

	return <>{s}</>;
}

interface CaseProps<T> {
	$: T | ((a: T) => boolean);
	children: CaseRenderer;
}

type CaseEval<T> = (a: T) => boolean;

type CaseRenderer = () => JSX.Element;

type CaseTuple<T> = { $: T | CaseEval<T>; renderer: CaseRenderer };

export function Case<T>(
	{ $, children }: CaseProps<T>,
): CaseTuple<T> {
	return { $, renderer: children };
}

export function Default({ children }: Pick<CaseProps<unknown>, "children">): CaseRenderer {
	return children;
}
