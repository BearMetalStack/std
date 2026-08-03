import { getCurrentOwner, type JSX, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { effect } from "../signals.ts";
import { Signal } from "../signals/wrapper.ts";

interface ForProps<T> {
	$: Signal.State<T[]> | Signal.Computed<T[]>;
	keyOn: (item: T) => string | number;
	children: (a: T, i: number) => JSX.Element | Element | null;
}

export function For<T>({ $, keyOn, children }: ForProps<T>): ReturnType<typeof each<T>> {
	return each($, children, keyOn);
}

function ownerScope() {
	const prev = getCurrentOwner();
	const cleanups: Array<() => void> = [];
	setCurrentOwner({
		registerCleanup: (fn) => cleanups.push(fn),
		registerRef: prev?.registerRef?.bind(prev),
		get refs() {
			return prev?.refs;
		},
	});
	return {
		cleanups,
		[Symbol.dispose]() {
			setCurrentOwner(prev);
		},
	};
}

/**
 * Renders a keyed, reconciled list.
 *
 * The managed nodes are anchored after a single empty text-node marker rather
 * than parented under a wrapper element. That keeps the list **transparent** in
 * the DOM: its items become direct siblings of whatever the returned fragment is
 * inserted into, so `each()` works inside parents that only accept specific
 * children — `<select>` (`<option>`), `<table>`/`<tbody>` (`<tr>`), `<ul>`
 * (`<li>`) — where an intervening `<slot>` would suppress rendering entirely.
 *
 * The returned fragment carries the marker; inserting it (via JSX or
 * `appendChild`) empties the fragment and moves the marker into the live parent,
 * which is thereafter always `anchor.parentNode`. Reconciliation only ever
 * positions items relative to that anchor, so the list stays contiguous even
 * with other siblings before or after it. See `appendReactiveChild` in
 * `jsx/lib/jsx.ts` for the related marker-range technique.
 */
export function each<T>(
	signal: Signal.State<T[] | Set<T>> | Signal.Computed<T[] | Set<T>>,
	render: (item: T, index: number) => Element | JSX.Element | null,
	key: (item: T) => string | number,
): DocumentFragment {
	const anchor = document.createTextNode("");
	const fragment = document.createDocumentFragment();
	fragment.append(anchor);

	// const owner = getCurrentOwner();
	using scope = ownerScope();

	const stop = reconcile(anchor, signal, render as (i: T, ii: number) => Element, key);
	// if (!owner) {
	// 	console.warn(
	// 		"each() called without an owner — list cleanup won't be automatic.\n" +
	// 			"Call the returned fragment's cleanup manually, or call each() inside:\n" +
	// 			"  • a BmElement.init() method\n" +
	// 			"  • an each() render callback",
	// 	);
	// }
	scope.cleanups.push(stop);
	// owner?.registerCleanup(stop);

	return fragment;
}

function shallowDiff<T>(
	signal: Signal.State<T[] | Set<T>> | Signal.Computed<T[] | Set<T>>,
	key: (item: T) => string | number,
) {
	let prev = new Map<string | number, T>();

	return new Signal.Computed(() => {
		const items = Array.from(signal.get());
		const next = new Map(items.map((item) => [key(item), item]));

		const added: T[] = [];
		const updated: T[] = [];
		const removed: (string | number)[] = [];

		for (const [k, item] of next) {
			if (!prev.has(k)) {
				added.push(item);
			} else {
				const prevItem = prev.get(k)!;
				const changed = Object.keys(item as object).some((prop) =>
					(item as any)[prop] !== (prevItem as any)[prop]
				);
				if (changed) updated.push(item);
			}
		}

		for (const k of prev.keys()) {
			if (!next.has(k)) removed.push(k);
		}

		prev = next;
		return { added, removed, updated };
	});
}

function reconcile<T>(
	anchor: Text,
	signal: Signal.State<T[] | Set<T>> | Signal.Computed<T[] | Set<T>>,
	render: (item: T, index: number) => Element | null,
	key: (item: T) => string | number,
) {
	const keyMap = new Map<string | number, { node: Element; cleanup?: () => void }>();
	const diff = shallowDiff(signal, key);

	const stop = effect(() => {
		const { added, removed, updated } = diff.get();
		const items = Array.from(signal.get());

		for (const k of removed) {
			const entry = keyMap.get(k);
			entry?.cleanup?.();
			entry?.node.remove();
			keyMap.delete(k);
		}

		for (const item of updated) {
			const k = key(item);
			const entry = keyMap.get(k);
			if (!entry) continue;
			using scope = ownerScope();
			const newNode = render(item, items.indexOf(item));
			entry.cleanup?.();
			if (newNode == null) {
				keyMap.delete(k);
				entry.node.remove();
				continue;
			}
			entry.node.replaceWith(newNode);
			entry.node = newNode;
			entry.cleanup = () => scope.cleanups.forEach((fn) => fn());
		}

		for (const item of added) {
			const k = key(item);
			using scope = ownerScope();
			const node = render(item, items.indexOf(item));
			if (node == null) continue;
			keyMap.set(k, { node, cleanup: () => scope.cleanups.forEach((fn) => fn()) });
		}

		// Reorder in place, walking the sibling chain from `anchor`. Each managed
		// node is moved only when it is not already where signal order wants it,
		// so untouched items keep their identity (and DOM state) across updates.
		// Newly added nodes, still detached, are inserted here on their first pass.
		let previousNode: ChildNode = anchor;
		for (const item of items) {
			const k = key(item);
			const entry = keyMap.get(k);
			if (!entry) continue;
			const { node } = entry;
			if (previousNode.nextSibling !== node) {
				previousNode.after(node);
			}
			previousNode = node;
		}
	});

	return () => {
		stop();
		for (const entry of keyMap.values()) entry.cleanup?.();
		keyMap.clear();
	};
}
