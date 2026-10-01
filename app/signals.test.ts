import { assertEquals, assertFalse } from "@std/assert";
import { getCurrentOwner, type Owner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { Signal } from "@signals";
import { createComputed, createSignal, effect } from "./signals.ts";

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

Deno.test("computed re-establishes its owner when the graph recomputes it late", async () => {
	const owner = fakeOwner();
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
	assertEquals(seen[0], owner, "the synchronous first computation sees the owner");
	assertEquals(seen[1], owner, "the late graph-driven recompute re-establishes the owner");
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
