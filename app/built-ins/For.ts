import { getCurrentOwner, type JSX, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { effect } from "../signals.ts";
import { Signal } from "../signals/wrapper.ts";
import type { SignalOf } from "../types.ts";

type Key = string | number;

/**
 * Per-row reactive state {@linkcode each} hands its render callback, so a row
 * can react to things that change *about* it without being rebuilt.
 */
export interface EachRow {
	/** The row's key. */
	readonly key: Key;
	/** The row's current position. Unlike the render callback's `index`, follows reorders. */
	readonly index: Signal.Computed<number>;
	/**
	 * Whether this row is the selected one, per the `selected` option. Only the
	 * rows whose answer changed are notified, so moving a selection touches two
	 * rows rather than rebuilding the list. Always `false` with no `selected`.
	 */
	readonly selected: Signal.Computed<boolean>;
}

/** Options for {@linkcode each}. */
export interface EachOptions {
	/**
	 * The selected key, or several (an array or set of keys). Drives each row's
	 * {@linkcode EachRow.selected}.
	 */
	selected?: SignalOf<Key | null | undefined | readonly Key[] | ReadonlySet<Key>>;
}

/** What `each()` and `<For>` call to build a row. */
export type EachRender<T> = (
	item: T,
	index: number,
	row: EachRow,
) => Element | JSX.Element | null;

interface ForProps<T> {
	$: SignalOf<T[]>;
	keyOn: (item: T) => Key;
	/** The selected key(s); see {@linkcode EachOptions.selected}. */
	selected?: EachOptions["selected"];
	children: EachRender<T>;
}

/**
 * A keyed, reconciled list. See {@linkcode each}.
 *
 * @example
 * ```tsx
 * <For $={results} keyOn={(r) => r.id} selected={activeId}>
 *   {(result, _i, row) => <li class-active={row.selected}>{result.name}</li>}
 * </For>
 * ```
 */
export function For<T>(
	{ $, keyOn, selected, children }: ForProps<T>,
): ReturnType<typeof each<T>> {
	return each($, children, keyOn, { selected });
}

function isSelected(
	selection: Key | null | undefined | readonly Key[] | ReadonlySet<Key>,
	key: Key,
): boolean {
	if (selection == null) return false;
	if (typeof selection === "object") {
		return selection instanceof Set
			? selection.has(key)
			: (selection as readonly Key[]).includes(key);
	}
	return selection === key;
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
	signal: SignalOf<T[] | Set<T>>,
	render: EachRender<T>,
	key: (item: T) => Key,
	options: EachOptions = {},
): DocumentFragment {
	const anchor = document.createTextNode("");
	const fragment = document.createDocumentFragment();
	fragment.append(anchor);

	const owner = getCurrentOwner();

	const stop = reconcile(
		anchor,
		signal,
		render as (i: T, ii: number, row: EachRow) => Element,
		key,
		options,
	);
	if (!owner) {
		console.warn(
			"each() called without an owner — list cleanup won't be automatic.\n" +
				"Call the returned fragment's cleanup manually, or call each() inside:\n" +
				"  • a BmElement.init() method\n" +
				"  • an each() render callback",
		);
	}
	owner?.registerCleanup(stop);

	return fragment;
}

function shallowDiff<T>(
	signal: SignalOf<T[] | Set<T>>,
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
	signal: SignalOf<T[] | Set<T>>,
	render: (item: T, index: number, row: EachRow) => Element | null,
	key: (item: T) => Key,
	options: EachOptions,
) {
	const keyMap = new Map<
		Key,
		{ node: Element; cleanup?: () => void; row: EachRow; position: Signal.State<number> }
	>();
	const diff = shallowDiff(signal, key);
	const { selected } = options;
	const noSelection = new Signal.Computed(() => false);

	const makeRow = (k: Key, index: number) => {
		const position = new Signal.State(index);
		const row: EachRow = {
			key: k,
			index: new Signal.Computed(() => position.get()),
			selected: selected ? new Signal.Computed(() => isSelected(selected.get(), k)) : noSelection,
		};
		return { row, position };
	};

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
			const newNode = render(item, items.indexOf(item), entry.row);
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
			const index = items.indexOf(item);
			const { row, position } = makeRow(k, index);
			const node = render(item, index, row);
			if (node == null) continue;
			keyMap.set(k, {
				node,
				cleanup: () => scope.cleanups.forEach((fn) => fn()),
				row,
				position,
			});
		}

		// Reorder in place, walking the sibling chain from `anchor`. Each managed
		// node is moved only when it is not already where signal order wants it,
		// so untouched items keep their identity (and DOM state) across updates.
		// Newly added nodes, still detached, are inserted here on their first pass.
		let previousNode: ChildNode = anchor;
		let position = 0;
		for (const item of items) {
			const k = key(item);
			const entry = keyMap.get(k);
			if (!entry) continue;
			const { node } = entry;
			const at = position++;
			if (Signal.subtle.untrack(() => entry.position.get()) !== at) entry.position.set(at);
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
