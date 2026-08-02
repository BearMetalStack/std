// The DOM here is @bearmetal/slag. The side-effect import must stay first:
// `./For.ts` reaches `@bearmetal/jsx/jsx-runtime`, which picks its client or
// server half from `typeof document !== "undefined"` once, at import time.
import "@bearmetal/slag/global";
import { assertEquals, assertExists } from "@std/assert";
import { type SlagElement, SlagText } from "@bearmetal/slag";
import { each, For } from "./For.ts";
import { createSignal } from "../signals.ts";
import { getCurrentOwner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";

// Signal writes flush reactively via a microtask-scheduled Watcher; a macrotask
// tick guarantees that queue (including any nested hops) has fully drained.
function flush(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

function fakeOwner() {
	const cleanups: Array<() => void> = [];
	return {
		registerCleanup: (fn: () => void) => cleanups.push(fn),
		runCleanups: () => cleanups.forEach((fn) => fn()),
	};
}

/**
 * Mirrors `BMElement`'s real shape: refs live behind a private field only
 * reachable through a properly-bound `this`, so a `registerRef` forwarded
 * without `.bind()` would throw instead of silently losing the ref.
 */
class FakeOwnerWithRefs {
	#refs = new Map<string, unknown>();
	#cleanups: Array<() => void> = [];
	registerCleanup = (fn: () => void) => this.#cleanups.push(fn);
	registerRef(name: string, el: unknown): void {
		this.#refs.set(name, el);
	}
	getRef(name: string): unknown {
		return this.#refs.get(name);
	}
	runCleanups(): void {
		this.#cleanups.forEach((fn) => fn());
	}
}

/**
 * Mounts an `each()` fragment into a fresh host and returns the host. `each()`
 * is transparent — its items land as direct children of the host — so tests
 * inspect the host, not a wrapper.
 */
function mount(fragment: unknown, hostTag = "div"): SlagElement {
	const host = document.createElement(hostTag) as unknown as SlagElement;
	(host as unknown as { appendChild(n: unknown): void }).appendChild(fragment);
	return host;
}

function tags(host: SlagElement): string[] {
	return host.children.map((child) => child.localName);
}

interface Item {
	id: number;
	label: string;
}

function render(item: Item) {
	return document.createElement(item.label) as unknown as Element;
}

Deno.test("each renders items in initial signal order", async () => {
	setCurrentOwner(fakeOwner());
	try {
		const signal = createSignal<Item[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }]);
		const host = mount(each(signal, render, (i) => i.id));
		await flush();
		assertEquals(tags(host), ["a", "b"]);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("each is transparent — items are direct children of the host, no wrapper", async () => {
	setCurrentOwner(fakeOwner());
	try {
		const signal = createSignal<Item[]>([{ id: 1, label: "option" }, { id: 2, label: "option" }]);
		// A <select> only renders <option> children directly — a <slot> wrapper
		// would suppress them entirely.
		const host = mount(each(signal, render, (i) => i.id), "select");
		await flush();
		assertEquals(tags(host), ["option", "option"]);
		// The only non-element child is the single empty text-node anchor marker.
		const nonElements = host.childNodes.filter((n) => n.nodeType !== 1);
		assertEquals(nonElements.length, 1);
		assertEquals(nonElements.every((n) => n instanceof SlagText), true);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("each inserts new items at their signal-order position, not the end", async () => {
	setCurrentOwner(fakeOwner());
	try {
		const signal = createSignal<Item[]>([{ id: 1, label: "a" }, { id: 3, label: "c" }]);
		const host = mount(each(signal, render, (i) => i.id));
		await flush();
		assertEquals(tags(host), ["a", "c"]);

		signal.set([{ id: 1, label: "a" }, { id: 2, label: "b" }, { id: 3, label: "c" }]);
		await flush();
		assertEquals(tags(host), ["a", "b", "c"]);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("each removes items and runs their cleanup", async () => {
	setCurrentOwner(fakeOwner());
	try {
		const removed: number[] = [];
		const signal = createSignal<Item[]>([{ id: 1, label: "a" }, { id: 2, label: "b" }]);
		const host = mount(each(signal, (item) => {
			getCurrentOwner()?.registerCleanup(() => removed.push(item.id));
			return render(item);
		}, (i) => i.id));
		await flush();
		assertEquals(tags(host), ["a", "b"]);

		signal.set([{ id: 2, label: "b" }]);
		await flush();
		assertEquals(tags(host), ["b"]);
		assertEquals(removed, [1]);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("each re-renders and cleans up the old node when an item's shallow props change", async () => {
	setCurrentOwner(fakeOwner());
	try {
		let renderCount = 0;
		const cleaned: number[] = [];
		const signal = createSignal<Item[]>([{ id: 1, label: "v0" }]);
		const host = mount(each(signal, (item) => {
			renderCount++;
			const thisRender = renderCount;
			getCurrentOwner()?.registerCleanup(() => cleaned.push(thisRender));
			return render(item);
		}, (i) => i.id));
		await flush();
		assertEquals(renderCount, 1);
		assertEquals(tags(host), ["v0"]);

		signal.set([{ id: 1, label: "v1" }]);
		await flush();
		assertEquals(renderCount, 2);
		assertEquals(tags(host), ["v1"]);
		assertEquals(cleaned, [1]);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("each reorders existing nodes without re-rendering unchanged items", async () => {
	setCurrentOwner(fakeOwner());
	try {
		let renderCount = 0;
		const a: Item = { id: 1, label: "a" };
		const b: Item = { id: 2, label: "b" };
		const signal = createSignal<Item[]>([a, b]);
		const host = mount(each(signal, (item) => {
			renderCount++;
			return render(item);
		}, (i) => i.id));
		await flush();
		assertEquals(tags(host), ["a", "b"]);
		assertEquals(renderCount, 2);

		signal.set([b, a]);
		await flush();
		assertEquals(tags(host), ["b", "a"]);
		assertEquals(renderCount, 2, "reordering unchanged objects should not re-render them");
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("refs registered by a render callback land on the real owning component, not the per-item scope", async () => {
	const owner = new FakeOwnerWithRefs();
	setCurrentOwner(owner);
	try {
		const signal = createSignal<Item[]>([{ id: 1, label: "a" }]);
		mount(each(signal, (item) => {
			const el = render(item);
			getCurrentOwner()?.registerRef?.(`item-${item.id}`, el);
			return el;
		}, (i) => i.id));
		await flush();
		assertExists(owner.getRef("item-1"), "ref declared inside the render callback should register");
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("each warns when called without a current owner", async () => {
	setCurrentOwner(null);
	const warnings: unknown[][] = [];
	const original = console.warn;
	console.warn = (...args: unknown[]) => warnings.push(args);
	try {
		const signal = createSignal<Item[]>([{ id: 1, label: "a" }]);
		each(signal, render, (i) => i.id);
		await flush();
		assertEquals(warnings.length, 1);
	} finally {
		console.warn = original;
	}
});

Deno.test("each registers its stop function as a cleanup on the current owner", async () => {
	const owner = fakeOwner();
	setCurrentOwner(owner);
	try {
		const signal = createSignal<Item[]>([{ id: 1, label: "a" }]);
		const host = mount(each(signal, render, (i) => i.id));
		await flush();
		assertEquals(tags(host), ["a"]);

		owner.runCleanups();
		signal.set([{ id: 2, label: "b" }]);
		await flush();
		assertEquals(
			tags(host),
			["a"],
			"stopped reconciliation should no longer react to signal changes",
		);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("For delegates to each", async () => {
	setCurrentOwner(fakeOwner());
	try {
		const signal = createSignal<Item[]>([{ id: 1, label: "a" }]);
		const host = mount(For({
			$: signal,
			keyOn: (i) => i.id,
			children: render,
		}));
		await flush();
		assertEquals(tags(host), ["a"]);
	} finally {
		setCurrentOwner(null);
	}
});
