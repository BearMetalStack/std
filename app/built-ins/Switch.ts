import { getCurrentOwner, type JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "../signals/wrapper.ts";
import { createComputed } from "../signals.ts";
import { borrowOwnership } from "../util/ownership.ts";
import { drain } from "../util/drain.ts";

const CASE: unique symbol = Symbol.for("bearmetal.case");

interface SwitchProps<T> {
	$: Signal.State<T> | Signal.Computed<T>;
	/** enable node preservation */
	$$?: boolean;
	children: JSX.Element | JSX.Element[];
}

export function Switch<T>(
	{ $, $$, children }: SwitchProps<T>,
): Signal.Computed<JSX.Element | null> {
	const map = new Map<T, CaseRenderer>();
	const evaluators: [CaseEval<T>, CaseRenderer][] = [];
	let fallback: CaseRenderer | undefined;
	for (const child of Array.isArray(children) ? children : [children]) {
		if (!isCaseTuple<T>(child)) {
			console.warn("<Switch> ignoring child that is not a <Case> or <Default>:", child);
			continue;
		}
		if (child[CASE] === "default") fallback = child.renderer;
		else if (typeof child.$ === "function") {
			evaluators.push([child.$ as CaseEval<T>, child.renderer]);
		} else map.set(child.$ as T, child.renderer);
	}

	const cache = new Map<T, JSX.Element | null>();

	const cleanups: (() => void)[] = [];
	const owner = getCurrentOwner();

	let prevVal: T | undefined = undefined;
	let prevNode: JSX.Element | null = null;
	return createComputed(() => {
		const val = $.get();
		if (prevVal === val) return prevNode;
		prevVal = val;
		drain(cleanups, (e) => e());

		if ($$) {
			const node = cache.get(val);
			if (node !== undefined) return node;
		}

		let renderer = map.get(val);
		if (!renderer) {
			for (const [evalFn, r] of evaluators) {
				if (evalFn(val)) {
					renderer = r;
					break;
				}
			}
		}
		prevNode = borrowOwnership(
			{
				registerCleanup(e) {
					cleanups.push(e);
				},
			},
			() => (renderer ?? fallback)?.() ?? null,
			() => drain(cleanups, (e) => e()),
			owner
		);
		if ($$) cache.set(val, prevNode);
		// return prevNode;
		return (renderer ?? fallback)?.() ?? null;
	});
}

interface CaseProps<T> {
	$: T | ((a: T) => boolean);
	children: CaseRenderer;
}

type CaseEval<T> = (a: T) => boolean;

type CaseRenderer = () => JSX.Element;

interface CaseTuple<T> {
	[CASE]: "case" | "default";
	$?: T | CaseEval<T>;
	renderer: CaseRenderer;
}

function isCaseTuple<T>(x: unknown): x is CaseTuple<T> {
	return typeof x === "object" && x !== null && CASE in x;
}

export function Case<T>({ $, children }: CaseProps<T>): JSX.Element {
	const tuple: CaseTuple<T> = { [CASE]: "case", $, renderer: children };
	return tuple as unknown as JSX.Element;
}

export function Default({ children }: Pick<CaseProps<unknown>, "children">): JSX.Element {
	const tuple: CaseTuple<never> = { [CASE]: "default", renderer: children };
	return tuple as unknown as JSX.Element;
}
