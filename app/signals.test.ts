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

Deno.test("a signal written from inside an effect does not notify its readers", async () => {
	// Not a wish — a constraint, recorded so it is discovered here rather than as
	// a component that silently renders stale content. `effect()` is a
	// `Signal.Computed` driven by a Watcher, so its body runs as a computation,
	// and the graph will not propagate a write made during one.
	//
	// Anything deriving state from a signal must therefore push from a plain
	// callback (a DOM event, a history hook) rather than from an effect. The
	// router's `subscribeToUrl` exists for exactly this reason.
	const source = createSignal("a");
	const relayed = createSignal("");
	let reads = 0;

	const stopWriter = effect(() => relayed.set(source.get()));
	const stopReader = effect(() => {
		relayed.get();
		reads++;
	});

	assertEquals(reads, 1);
	source.set("b");
	await new Promise((r) => setTimeout(r, 0));

	assertEquals(relayed.get(), "b", "the value does change");
	assertEquals(reads, 1, "but nothing reading it re-runs");

	stopWriter();
	stopReader();
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
