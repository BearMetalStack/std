import { Signal } from "@bearmetal/app/signals";
import { getCurrentOwner, setCurrentOwner } from "@bearmetal/jsx/client";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";

let needsFlush = true;
const watcher = new Signal.subtle.Watcher(() => {
	if (needsFlush) {
		needsFlush = false;
		queueMicrotask(flushEffects);
	}
});

function flushEffects() {
	needsFlush = true;
	for (const s of watcher.getPending()) {
		s.get();
	}
	watcher.watch();
}

type CleanupFn = () => void;

export function effect(fn: () => CleanupFn | void): CleanupFn {
	let cleanup: CleanupFn | void;

	const computed = new Signal.Computed(() => {
		if (typeof cleanup === "function") cleanup();
		cleanup = fn();
	});

	watcher.watch(computed);
	computed.get();

	return () => {
		watcher.unwatch(computed);
		if (typeof cleanup === "function") cleanup();
	};
}

export function createEffect(init: () => CleanupFn | void): CleanupFn {
	if (!getCurrentOwner()) {
		console.warn(
			"createEffect() called without an owner — cleanup won't be automatic.\n" +
				"Call the returned function to clean up manually, or call createEffect() inside:\n" +
				"  • a BmElement.init() method\n" +
				"  • an each() render callback",
		);
	}
	const cleanup = effect(init);
	getCurrentOwner()?.registerCleanup(cleanup);
	return cleanup;
}

export function createSignal(init: unknown): Signal.State<unknown> {
	return new Signal.State(init);
}

function ownerScope() {
	const prev = getCurrentOwner();
	const cleanups: Array<() => void> = [];
	setCurrentOwner({ registerCleanup: (fn) => cleanups.push(fn) });
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
			// TODO: Pretty sure this becomes an n^2 problem, should have the initial idx as part of the payloads
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
			// TODO: Pretty sure this becomes an n^2 problem, should have the initial idx as part of the payloads
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
