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
		// Refs registered by a render callback (e.g. `ref="foo"` on a list item)
		// must land on the real owning component, not this per-item scope, or
		// they'd silently never be recorded — `clientJsx` only special-cases
		// `ref` when `_currentOwner.registerRef` exists.
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

export function each<T>(
	signal: Signal.State<T[] | Set<T>> | Signal.Computed<T[] | Set<T>>,
	render: (item: T, index: number) => Element | JSX.Element | null,
	key: (item: T) => string | number,
): HTMLSlotElement {
	const anchor = document.createElement("slot");

	const stop = reconcile(anchor, signal, render as (i: T, ii: number) => Element, key);
	if (!getCurrentOwner()) {
		console.warn(
			"each() called without an owner — list cleanup won't be automatic.\n" +
				"Call the returned anchor's cleanup manually, or call each() inside:\n" +
				"  • a BmElement.init() method\n" +
				"  • an each() render callback",
		);
	}
	getCurrentOwner()?.registerCleanup(stop);

	return anchor;
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
	parent: Element,
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

		let previousNode: Element | null = null;
		for (const item of items) {
			const k = key(item);
			const entry = keyMap.get(k);
			if (!entry) continue;
			const { node } = entry;
			const expectedPrev: Element | null = previousNode
				? previousNode.nextElementSibling
				: parent.firstElementChild;
			if (node !== expectedPrev) {
				previousNode ? previousNode.after(node) : parent.prepend(node);
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
