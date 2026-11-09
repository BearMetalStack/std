import { assert, assertEquals, assertFalse } from "@std/assert";
import { getCurrentOwner, type Owner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { Signal } from "@signals";
import { createComputed, createEffect, createSignal, effect } from "./signals.ts";

function flush(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

function fakeOwner(): Owner {
	return { registerCleanup: () => {} };
}

Deno.test("effect re-establishes its creation-time owner on late re-runs", async () => {
	const owner = fakeOwner();
	const s = createSignal(0);
	const seen: Owner[] = [];

	setCurrentOwner(owner);

	const stop = effect(() => {
		s.get();
		seen.push(getCurrentOwner());
	});

	setCurrentOwner(null);

	s.set(1);
	await flush();
	stop();

	assertEquals(seen.length, 2);
	assertEquals(seen[0], owner, "the synchronous first run sees the owner");
	assertEquals(seen[1], owner, "the late re-run re-establishes the same owner, not null");
});

Deno.test("computed runs under its owner's scope when the graph recomputes it late", async () => {
	const refs = {};
	const owner: Owner = { registerCleanup: () => {}, refs };
	const trigger = createSignal(0);
	const seen: Owner[] = [];

	setCurrentOwner(owner);
	const derived = createComputed(() => {
		seen.push(getCurrentOwner());
		return trigger.get();
	});
	const stop = effect(() => {
		derived.get();
	});
	setCurrentOwner(null);

	trigger.set(1);
	await flush();
	stop();

	assertEquals(seen.length, 2);
	for (const [i, when] of [[0, "the synchronous first"], [1, "the late graph-driven"]] as const) {
		assert(seen[i] !== null, `${when} computation has an owner`);
		assert(seen[i]!.refs === refs, `${when} computation's refs reach the creating owner`);
	}
});

Deno.test("effect restores the ambient owner after a late run — no global leak", async () => {
	setCurrentOwner(null);
	const owner = fakeOwner();
	setCurrentOwner(owner);

	const s = createSignal(0);
	const stop = effect(() => {
		s.get();
	});
	setCurrentOwner(null);

	s.set(1);
	await flush();

	assertEquals(
		getCurrentOwner(),
		null,
		"the flush must not leave an owner pinned on the global",
	);
	stop();
});

Deno.test("a signal written from inside an effect notifies its readers on the next pass", async () => {
	// This used to be pinned as a constraint: the Watcher stays notified for the
	// whole pass, so the write marked the reader dirty without notifying anyone,
	// and the reader was stranded until some unrelated write came along.
	const source = createSignal("a");
	const relayed = createSignal("");
	const seen: string[] = [];

	const stopWriter = effect(() => relayed.set(source.get()));
	const stopReader = effect(() => {
		seen.push(relayed.get());
	});

	assertEquals(seen, ["a"]);
	source.set("b");
	await flush();
	assertEquals(seen, ["a", "b"]);
	source.set("c");
	await flush();
	assertEquals(seen, ["a", "b", "c"]);

	stopWriter();
	stopReader();
});

Deno.test("effects feeding each other stop after the cycle limit instead of spinning", async () => {
	const a = createSignal(0);
	const b = createSignal(0);
	const warn = console.warn;
	const warnings: unknown[] = [];
	console.warn = (...args: unknown[]) => warnings.push(args[0]);
	try {
		const stopA = effect(() => b.set(a.get() + 1));
		const stopB = effect(() => a.set(b.get() + 1));
		await flush();
		assertEquals(warnings.length, 1);
		const settled = a.get();
		await flush();
		assertEquals(a.get(), settled, "nothing keeps running after the warning");
		stopA();
		stopB();

		const other = createSignal(0);
		const seen: number[] = [];
		const stopOther = effect(() => {
			seen.push(other.get());
		});
		other.set(1);
		await flush();
		assertEquals(seen, [0, 1], "an outside write still flushes after a give-up");
		stopOther();
	} finally {
		console.warn = warn;
	}
});

Deno.test("creating an effect nested inside another effect's run does not wire the inner effect as the outer's dependency", () => {
	// Mirrors a child BMElement's connectedCallback (and its own addEffect) firing
	// synchronously during a parent's render effect — e.g. from DOM insertion
	// inside the parent's `#attach()`. `effect()`'s bootstrap evaluation used to
	// call the internal Computed's `.get()` unwrapped, which — via the ordinary
	// producerAccessed bookkeeping — attributed that read to whatever the
	// *ambient* active consumer was, i.e. the outer effect still on the call
	// stack. The inner effect then became a spurious live dependency of the
	// outer one.
	//
	// This is checked structurally (via `Signal.subtle` introspection) rather
	// than by counting re-runs: an effect's own wrapper Computed always
	// evaluates to `undefined`, so a spurious version bump on it can never be
	// observed this way — the edge itself is the bug, whether or not it happens
	// to also cause a visible extra re-run in a particular case.
	let outerComputed: Signal.Computed<unknown> | undefined;
	let innerComputed: Signal.Computed<unknown> | undefined;
	let stopInner: (() => void) | undefined;

	const stopOuter = effect(() => {
		outerComputed = Signal.subtle.currentComputed();
		// The nested effect() call, made synchronously while `outerComputed` is
		// still the graph's activeConsumer — mirrors a child component's
		// connectedCallback (and its own addEffect) firing during the parent's
		// #attach(), itself inside the parent's render effect.
		stopInner = effect(() => {
			innerComputed = Signal.subtle.currentComputed();
		});
	});

	assertFalse(outerComputed === undefined);
	assertFalse(innerComputed === undefined);
	assertFalse(
		Signal.subtle.introspectSinks(innerComputed!).includes(outerComputed!),
		"the outer effect must not appear as a live consumer of the inner effect's own Computed",
	);

	stopInner!();
	stopOuter();
});

Deno.test("type guards answer false for null and primitives instead of throwing", () => {
	const state = new Signal.State(1);
	const computed = new Signal.Computed(() => state.get());
	const watcher = new Signal.subtle.Watcher(() => {});
	for (const value of [null, undefined, 0, "", "x", true, Symbol("s"), {}, [], () => {}]) {
		assertFalse(Signal.isState(value));
		assertFalse(Signal.isComputed(value));
		assertFalse(Signal.isWatcher(value));
	}
	assertEquals(Signal.isState(state), true);
	assertEquals(Signal.isComputed(computed), true);
	assertEquals(Signal.isWatcher(watcher), true);
	assertFalse(Signal.isState(computed));
});

Deno.test("an effect that throws does not stop other effects re-running", async () => {
	const bad = createSignal(0);
	const good = createSignal(0);
	const seen: number[] = [];
	const errors: unknown[] = [];
	const origError = console.error;
	console.error = (...args: unknown[]) => errors.push(args);
	try {
		const stopBad = effect(() => {
			if (bad.get() > 0) throw new Error("boom");
		});
		const stopGood = effect(() => {
			seen.push(good.get());
		});

		bad.set(1);
		await flush();
		good.set(1);
		await flush();
		good.set(2);
		await flush();

		stopBad();
		stopGood();
	} finally {
		console.error = origError;
	}

	assertEquals(seen, [0, 1, 2], "the healthy effect keeps re-running after another one threw");
	assertEquals(errors.length, 1, "the throw is reported once");
});

Deno.test("an effect's cleanup does not become a dependency of the effect", async () => {
	const dep = createSignal(0);
	const readInCleanup = createSignal(0);
	let runs = 0;
	const stop = effect(() => {
		dep.get();
		runs++;
		return () => {
			readInCleanup.get();
		};
	});

	dep.set(1);
	await flush();
	assertEquals(runs, 2);

	readInCleanup.set(1);
	await flush();
	stop();

	assertEquals(runs, 2, "a signal read only by the cleanup does not re-run the effect");
});

Deno.test("a computed releases what its previous evaluation built when its value changes", async () => {
	const which = createSignal("a");
	const inner = createSignal(0);
	const runs: string[] = [];

	const view = createComputed(() => {
		const name = which.get();
		createEffect(() => {
			runs.push(`${name}:${inner.get()}`);
		});
		return name;
	});
	const stop = effect(() => {
		view.get();
	});

	which.set("b");
	await flush();
	runs.length = 0;

	inner.set(1);
	await flush();
	stop();

	assertEquals(runs, ["b:1"], "only the current evaluation's effect is still live");
});

Deno.test("a computed keeps its previous evaluation's work while its value is unchanged", async () => {
	const tick = createSignal(0);
	const inner = createSignal(0);
	const node = { id: "same" };
	const runs: number[] = [];
	let built = false;

	const view = createComputed(() => {
		tick.get();
		if (!built) {
			built = true;
			createEffect(() => {
				runs.push(inner.get());
			});
		}
		return node;
	});
	const stop = effect(() => {
		view.get();
	});

	tick.set(1);
	await flush();
	inner.set(1);
	await flush();
	stop();

	assertEquals(runs, [0, 1], "the value is the same object, so what built it stays alive");
});

Deno.test("a computed's scope is released with its owner", () => {
	const cleanups: (() => void)[] = [];
	const owner: Owner = { registerCleanup: (fn) => cleanups.push(fn) };
	const inner = createSignal(0);
	let released = false;

	setCurrentOwner(owner);
	const view = createComputed(() => {
		getCurrentOwner()!.registerCleanup(() => {
			released = true;
		});
		return inner.get();
	});
	setCurrentOwner(null);
	view.get();

	for (const fn of cleanups) fn();
	assertEquals(released, true);
});
