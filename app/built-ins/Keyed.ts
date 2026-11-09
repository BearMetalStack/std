import { getCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { createScope, watch } from "../signals.ts";
import type { SignalOf } from "../types.ts";

type Key = string | number;

/** What {@linkcode createKeyedNodes} hands back. */
export interface KeyedNodes<T, N extends Node> {
	/** The node for `item`'s key: rendered the first time it is asked for, the same node after. */
	get(item: T): N;
	/** Whether a node exists for `key`. */
	has(key: Key): boolean;
	/** Disposes every node now, whatever the source holds. */
	dispose(): void;
}

/**
 * One node per key, for as long as the key is in `source`, whichever parent
 * the node sits in meanwhile.
 *
 * Each node is rendered once, untracked, under its own scope
 * ({@linkcode createScope}). A component element is retained
 * (`BMElement.retain()`), so moving it between parents, even across several
 * effect passes or while it is briefly out of the DOM, never tears it down.
 * Its scope is disposed, and the element released, only when its key leaves
 * `source`, or when the owner this was created under is torn down.
 *
 * This is the tool for a tree whose subtrees move: a split view where panes
 * are re-parented as splits are made and collapsed. For a flat list, `<For>`
 * already keeps rows by key.
 *
 * @example
 * ```tsx
 * const panes = createKeyedNodes(allNodes, (n) => n.uuid, (n) => <WsPane pane={n} />);
 * // in each split's template:
 * {children.map((child) => panes.get(child))}
 * ```
 */
export function createKeyedNodes<T, N extends Node>(
	source: SignalOf<readonly T[]> | (() => readonly T[]),
	keyOf: (item: T) => Key,
	render: (item: T) => N,
): KeyedNodes<T, N> {
	const entries = new Map<Key, { node: N; dispose: () => void }>();

	const drop = (key: Key) => {
		const entry = entries.get(key);
		if (!entry) return;
		entries.delete(key);
		entry.dispose();
	};

	const disposeAll = () => {
		for (const key of [...entries.keys()]) drop(key);
	};

	watch(source, (items) => {
		const live = new Set(items.map(keyOf));
		for (const key of [...entries.keys()]) if (!live.has(key)) drop(key);
	});

	getCurrentOwner()?.registerCleanup(disposeAll);

	return {
		get(item: T): N {
			const key = keyOf(item);
			const existing = entries.get(key);
			if (existing) return existing.node;
			const [node, disposeScope] = createScope(() => render(item));
			const retain = (node as unknown as { retain?: () => () => void }).retain;
			const release = typeof retain === "function" ? retain.call(node) : () => {};
			entries.set(key, {
				node,
				dispose: () => {
					disposeScope();
					release();
				},
			});
			return node;
		},
		has: (key) => entries.has(key),
		dispose: disposeAll,
	};
}
