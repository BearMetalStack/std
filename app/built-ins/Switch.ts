import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Signal } from "../signals/wrapper.ts";
import { createComputed } from "../signals.ts";
import { borrowOwnership } from "../util/ownership.ts";
import { drain } from "../util/drain.ts";

const CASE: unique symbol = Symbol.for("bearmetal.case");

interface SwitchProps<T> {
	$: Signal.State<T> | Signal.Computed<T>;
	/**
	 * Keep-alive. Each branch is rendered once, the first time it is selected,
	 * and kept — nodes, DOM state and effects — while another branch shows. A
	 * kept branch is only torn down when the component owning the `<Switch>` is.
	 *
	 * Without it, switching away tears the old branch down: its effects stop,
	 * its cleanups run, and selecting it again renders it from scratch.
	 */
	$$?: boolean;
	children: JSX.Element | JSX.Element[];
}

/**
 * Renders the `<Case>` matching `$` (an exact value first, then the first
 * predicate that accepts it), else the `<Default>`.
 *
 * Branches are render functions so only the selected one is built. Leaving a
 * branch tears it down — effects stopped, cleanups run (so a pending debounce
 * in it is gone) — unless `$$` keeps every visited branch alive.
 *
 * @example
 * ```tsx
 * <Switch $={mode} $$>
 *   <Case $="write">{() => <Editor />}</Case>
 *   <Case $="preview">{() => <Preview />}</Case>
 *   <Default>{() => <p>Pick a mode</p>}</Default>
 * </Switch>
 * ```
 */
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

	/** Branches kept alive under `$$`, by value. */
	const kept = new Map<T, JSX.Element | null>();
	/** The cleanups of the branch showing now, when it is not kept. */
	let active: (() => void)[] = [];

	let prevVal: T | undefined = undefined;
	let prevNode: JSX.Element | null = null;
	return createComputed(() => {
		const val = $.get();
		if (prevVal === val) return prevNode;
		prevVal = val;
		drain(active, (e) => e());

		if ($$ && kept.has(val)) {
			prevNode = kept.get(val)!;
			return prevNode;
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
		// The parent owner is resolved from the ambient owner at render time.
		// This computed runs inside an owner-aware effect (the reactive child
		// that consumes it), so getCurrentOwner() is the owning component even
		// on late re-renders — no need to capture it up front.
		const cleanups: (() => void)[] = [];
		prevNode = borrowOwnership(
			{
				registerCleanup(e) {
					cleanups.push(e);
				},
			},
			() => (renderer ?? fallback)?.() ?? null,
			() => drain(cleanups, (e) => e()),
		);
		if ($$) kept.set(val, prevNode);
		else active = cleanups;
		return prevNode;
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
