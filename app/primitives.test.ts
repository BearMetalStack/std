import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { getCurrentOwner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import {
	createEffect,
	createFamily,
	createLazySignals,
	createMemo,
	createPersisted,
	createResource,
	createScope,
	createSignal,
	effect,
	ListSignal,
	storageSignal,
	watch,
} from "./bmsignals.ts";
import { flushAllSaves } from "./save.ts";

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function quietly<T>(fn: () => Promise<T>): Promise<T> {
	const warn = console.warn;
	console.warn = () => {};
	return fn().finally(() => (console.warn = warn));
}

// ── createScope ──

Deno.test("createScope disposes what was created under it, newest first, once", async () => {
	const order: string[] = [];
	const s = createSignal(0);
	const runs: number[] = [];
	const [value, dispose] = createScope(() => {
		getCurrentOwner()!.registerCleanup(() => order.push("first"));
		createEffect(() => {
			runs.push(s.get());
		});
		getCurrentOwner()!.registerCleanup(() => order.push("last"));
		return 42;
	});
	assertEquals(value, 42);
	dispose();
	dispose();
	s.set(1);
	await tick();
	assertEquals(order, ["last", "first"]);
	assertEquals(runs, [0], "the effect stopped with the scope");
});

Deno.test("createScope restores the outer owner and is not tied to it", () => {
	const outerCleanups: (() => void)[] = [];
	const outer = { registerCleanup: (fn: () => void) => outerCleanups.push(fn) };
	setCurrentOwner(outer);
	try {
		createScope(() => {
			getCurrentOwner()!.registerCleanup(() => {});
		});
		assertStrictEquals(getCurrentOwner(), outer);
		assertEquals(outerCleanups.length, 0);
	} finally {
		setCurrentOwner(null);
	}
});

Deno.test("createScope runs a cleanup registered after disposal at once", () => {
	let ran = false;
	let owner: ReturnType<typeof getCurrentOwner> = null;
	const [, dispose] = createScope(() => {
		owner = getCurrentOwner();
	});
	dispose();
	owner!.registerCleanup(() => (ran = true));
	assert(ran);
});

// ── createMemo / watch ──

Deno.test("createMemo is handed its previous value", async () => {
	const picked = createSignal<string | null>("a");
	const last = createMemo<string | null>((prev) => picked.get() ?? prev ?? null);
	const seen: (string | null)[] = [];
	const stop = effect(() => {
		seen.push(last.get());
	});
	picked.set(null);
	await tick();
	picked.set("b");
	await tick();
	stop();
	assertEquals(seen, ["a", "b"], "null kept the previous value, so nothing changed until b");
});

Deno.test("watch passes next and previous, untracked, only on change", async () => {
	const [calls, dispose] = createScope(() => {
		const a = createSignal(1);
		const other = createSignal(0);
		const calls: [number, number | undefined][] = [];
		watch(() => a.get() % 2, (next, prev) => {
			other.get();
			calls.push([next, prev]);
		});
		return { calls, a, other };
	});
	calls.a.set(3);
	await tick();
	calls.other.set(1);
	await tick();
	calls.a.set(4);
	await tick();
	dispose();
	assertEquals(calls.calls, [[1, undefined], [0, 1]]);
});

Deno.test("watch with immediate: false skips the starting value", async () => {
	const s = createSignal(0);
	const seen: number[] = [];
	const [, dispose] = createScope(() => watch(s, (v) => void seen.push(v), { immediate: false }));
	s.set(1);
	await tick();
	dispose();
	assertEquals(seen, [1]);
});

// ── createResource ──

Deno.test("createResource fetches per key and the latest key wins", async () => {
	const key = createSignal<string | null>("slow");
	const aborted: string[] = [];
	const [res, dispose] = createScope(() =>
		createResource(key, async (k, { signal }) => {
			signal.addEventListener("abort", () => aborted.push(k));
			await tick(k === "slow" ? 30 : 1);
			return k.toUpperCase();
		}, { initial: "" })
	);
	assertEquals(res.loading.get(), true);
	key.set("fast");
	await tick();
	await res.ready();
	await tick(40);
	assertEquals(res.value.get(), "FAST", "the slow answer for the old key never landed");
	assertEquals(aborted, ["slow"]);
	assertEquals(res.loading.get(), false);

	key.set(null);
	await tick();
	assertEquals(res.value.get(), "", "a null key resets to initial");
	dispose();
});

Deno.test("createResource keeps the error for the current key and refresh retries", async () => {
	let fail = true;
	const [res, dispose] = createScope(() =>
		createResource(createSignal("k"), () => {
			if (fail) throw new Error("down");
			return 1;
		}, { initial: 0 })
	);
	await res.ready();
	assert(res.error.get() instanceof Error);
	fail = false;
	await res.refresh();
	assertEquals(res.value.get(), 1);
	assertEquals(res.error.get(), undefined);
	dispose();
});

Deno.test("createResource aborts its fetch when its owner goes", async () => {
	let aborted = false;
	const [, dispose] = createScope(() =>
		createResource(createSignal(1), (_k, { signal }) => {
			signal.addEventListener("abort", () => (aborted = true));
			return new Promise<number>(() => {});
		}, { initial: 0 })
	);
	dispose();
	await tick();
	assert(aborted);
});

// ── createFamily / ListSignal ──

Deno.test("createFamily memoizes by key and forgets on delete", () => {
	let made = 0;
	const fam = createFamily((id: string) => ({ id, n: ++made }));
	assertStrictEquals(fam("a"), fam("a"));
	assert(fam.has("a") && !fam.has("b"));
	fam.delete("a");
	assertEquals(fam("a").n, 2);
	assertEquals([...fam.values()].length, 1);
});

Deno.test("createLazySignals still shares one signal per key", async () => {
	let calls = 0;
	const lazies = createLazySignals(0, (n: number) => {
		calls++;
		return n * 2;
	});
	assertStrictEquals(lazies(2), lazies(2));
	lazies(2).get();
	await tick();
	assertEquals(lazies(2).get(), 4);
	assertEquals(calls, 1);
});

Deno.test("ListSignal never mutates a list already read", () => {
	const list = new ListSignal([1, 2, 3]);
	const before = list.get();
	list.push(4);
	list.insert(0, 0);
	list.move(0, 4);
	assertEquals(list.remove((n) => n === 2), 1);
	list.replace(0, 9);
	assertEquals(list.removeAt(1), 3);
	assertEquals(before, [1, 2, 3]);
	assertEquals(list.get(), [9, 4, 0]);
});

// ── storageSignal / createPersisted ──

function memoryStorage(): Storage {
	const m = new Map<string, string>();
	return {
		getItem: (k) => m.get(k) ?? null,
		setItem: (k, v) => void m.set(k, v),
		removeItem: (k) => void m.delete(k),
		clear: () => m.clear(),
		key: (i) => [...m.keys()][i] ?? null,
		get length() {
			return m.size;
		},
	};
}

Deno.test("storageSignal reads once and writes on set", () => {
	const storage = memoryStorage();
	storage.setItem("k", JSON.stringify({ open: true }));
	const s = storageSignal("k", { open: false }, { storage });
	assertEquals(s.get(), { open: true });
	s.set({ open: false });
	assertEquals(storage.getItem("k"), JSON.stringify({ open: false }));
});

Deno.test("storageSignal falls back to initial and drops an unreadable entry", () => {
	const storage = memoryStorage();
	storage.setItem("k", "{not json");
	const s = storageSignal("k", 5, { storage });
	assertEquals(s.get(), 5);
	assertEquals(storage.getItem("k"), null);
});

Deno.test("createPersisted loads, then saves each set through a save task", async () => {
	const saved: unknown[] = [];
	const p = createPersisted(
		{ id: null as string | null },
		async () => {
			await tick();
			return { id: "stored" };
		},
		(v) => void saved.push(v),
		{ debounceMs: 5, owned: false },
	);
	assertEquals(p.loading.get(), true);
	await p.loaded;
	assertEquals(p.get(), { id: "stored" });
	assertEquals(saved, [], "loading is not a change");
	p.update((v) => ({ ...v, id: "next" }));
	await p.flush();
	assertEquals(saved, [{ id: "next" }]);
	await p.saves.dispose();
});

Deno.test("createPersisted keeps a value set before the load lands", async () => {
	const p = createPersisted(
		"initial",
		async () => {
			await tick(5);
			return "stored";
		},
		() => {},
		{ debounceMs: 1, owned: false },
	);
	p.set("local");
	await p.loaded;
	assertEquals(p.get(), "local");
	await quietly(() => flushAllSaves());
	await p.saves.dispose();
});
