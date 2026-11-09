import { getCurrentOwner, type JSX, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { effect } from "../signals.ts";
import { Signal } from "../signals/wrapper.ts";
import type { SignalOf } from "../types.ts";

type Key = string | number;

/**
 * Per-row reactive state {@linkcode each} hands its render callback, so a row
 * can react to things that change *about* it without being rebuilt.
 */
export interface EachRow<T = unknown> {
	/** The row's key. */
	readonly key: Key;
	/**
	 * The row's item as it is now. A row rebuilt on change gets the new item as
	 * its argument anyway; a row kept with `inPlace` reads updates from here.
	 */
	readonly item: Signal.State<T>;
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
	/**
	 * Keep a row when its item changes (by any shallow field) instead of
	 * rebuilding it, and hand the change to {@linkcode EachRow.item}. For rows
	 * with state the DOM must not lose, such as focus or a caret. Without it, a
	 * changed item is rendered again from scratch.
	 */
	inPlace?: boolean;
}

/** What `each()` and `<For>` call to build a row. */
export type EachRender<T> = (
	item: T,
	index: number,
	row: EachRow<T>,
) => Element | JSX.Element | null;

interface ForProps<T> {
	$: SignalOf<readonly T[]>;
	keyOn: (item: T) => Key;
	/** The selected key(s); see {@linkcode EachOptions.selected}. */
	selected?: EachOptions["selected"];
	/** See {@linkcode EachOptions.inPlace}. */
	inPlace?: boolean;
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
	{ $, keyOn, selected, inPlace, children }: ForProps<T>,
): ReturnType<typeof each<T>> {
	return each($, children, keyOn, { selected, inPlace });
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
	signal: SignalOf<readonly T[] | ReadonlySet<T>>,
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
		render as (i: T, ii: number, row: EachRow<T>) => Element,
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
	signal: SignalOf<readonly T[] | ReadonlySet<T>>,
	key: (item: T) => string | number,
) {
	let prev = new Map<string | number, T>();
	let warnedDuplicates = false;

	return new Signal.Computed(() => {
		const items = Array.from(signal.get());
		const next = new Map(items.map((item) => [key(item), item]));
		if (next.size !== items.length && !warnedDuplicates) {
			warnedDuplicates = true;
			console.warn(
				"each(): several items share a key, so only the last of each is rendered. " +
					"Keys must be unique within a list.",
			);
		}

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

/**
 * The nodes one row occupies, first to last. An element row is itself; a row
 * that rendered a fragment is bracketed by two empty text nodes, so it can be
 * moved and removed whole, including whatever its own reactive children later
 * insert inside it.
 */
interface Range {
	start: ChildNode;
	end: ChildNode;
}

function toRange(node: Node): { range: Range; insertable: Node } {
	if (node.nodeType === 11) {
		const frag = node as DocumentFragment;
		const start = document.createTextNode("");
		const end = document.createTextNode("");
		frag.prepend(start);
		frag.append(end);
		return { range: { start, end }, insertable: frag };
	}
	const el = node as ChildNode;
	return { range: { start: el, end: el }, insertable: el };
}

function nodesOf({ start, end }: Range): ChildNode[] {
	const nodes: ChildNode[] = [];
	for (let n: ChildNode | null = start; n; n = n.nextSibling) {
		nodes.push(n);
		if (n === end) break;
	}
	return nodes;
}

function reconcile<T>(
	anchor: Text,
	signal: SignalOf<readonly T[] | ReadonlySet<T>>,
	render: (item: T, index: number, row: EachRow<T>) => Element | null,
	key: (item: T) => Key,
	options: EachOptions,
) {
	interface Entry {
		range: Range;
		/** Not yet placed: the fragment holding a fresh row's nodes. */
		pending?: Node;
		cleanup?: () => void;
		row: EachRow<T>;
		item: Signal.State<T>;
		position: Signal.State<number>;
	}
	const keyMap = new Map<Key, Entry>();
	const diff = shallowDiff(signal, key);
	const { selected, inPlace } = options;
	const noSelection = new Signal.Computed(() => false);

	const makeRow = (k: Key, index: number, item: T) => {
		const position = new Signal.State(index);
		const current = new Signal.State<T>(item);
		const row: EachRow<T> = {
			key: k,
			item: current,
			index: new Signal.Computed(() => position.get()),
			selected: selected ? new Signal.Computed(() => isSelected(selected.get(), k)) : noSelection,
		};
		return { row, position, current };
	};

	/**
	 * Renders a row under its own scope, untracked: what the render reads is the
	 * row's business, not a dependency of the list. Tracked, a read here re-ran
	 * the reconcile with the same diff and rendered every added row again.
	 */
	const build = (item: T, index: number, row: EachRow<T>) => {
		using scope = ownerScope();
		const node = Signal.subtle.untrack(() => render(item, index, row));
		return { node, cleanup: () => scope.cleanups.forEach((fn) => fn()) };
	};

	const stop = effect(() => {
		const { added, removed, updated } = diff.get();
		const items = Array.from(signal.get());

		for (const k of removed) {
			const entry = keyMap.get(k);
			if (!entry) continue;
			entry.cleanup?.();
			for (const n of nodesOf(entry.range)) n.remove();
			keyMap.delete(k);
		}

		for (const item of updated) {
			const k = key(item);
			const entry = keyMap.get(k);
			if (!entry) continue;
			entry.item.set(item);
			if (inPlace) continue;
			const { node, cleanup } = build(item, items.indexOf(item), entry.row);
			entry.cleanup?.();
			const old = nodesOf(entry.range);
			if (node == null) {
				keyMap.delete(k);
				for (const n of old) n.remove();
				continue;
			}
			const { range, insertable } = toRange(node);
			old[0].before(insertable);
			for (const n of old) n.remove();
			entry.range = range;
			entry.cleanup = cleanup;
		}

		for (const item of added) {
			const k = key(item);
			const index = items.indexOf(item);
			const { row, position, current } = makeRow(k, index, item);
			const { node, cleanup } = build(item, index, row);
			if (node == null) continue;
			const { range, insertable } = toRange(node);
			keyMap.set(k, { range, pending: insertable, cleanup, row, item: current, position });
		}

		// Reorder in place, walking the sibling chain from `anchor`. Each row is
		// moved only when it is not already where signal order wants it, so
		// untouched rows keep their identity (and DOM state) across updates.
		// Newly added rows, still detached, are inserted here on their first pass.
		let previousNode: ChildNode = anchor;
		let position = 0;
		for (const item of items) {
			const k = key(item);
			const entry = keyMap.get(k);
			if (!entry) continue;
			const at = position++;
			if (Signal.subtle.untrack(() => entry.position.get()) !== at) entry.position.set(at);
			if (entry.pending) {
				previousNode.after(entry.pending);
				entry.pending = undefined;
			} else if (previousNode.nextSibling !== entry.range.start) {
				previousNode.after(...nodesOf(entry.range));
			}
			previousNode = entry.range.end;
		}
	});

	return () => {
		stop();
		for (const entry of keyMap.values()) entry.cleanup?.();
		keyMap.clear();
	};
}
