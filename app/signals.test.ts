import { assertEquals } from "@std/assert";
import { getCurrentOwner, type Owner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
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
