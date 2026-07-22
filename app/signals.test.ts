import { assertEquals } from "@std/assert";
import { getCurrentOwner, type Owner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { createSignal, effect } from "./signals.ts";

// Effects re-run inside a microtask-scheduled Watcher flush; a macrotask tick
// guarantees that queue has fully drained.
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
	// First run is synchronous, inside the init call stack where the owner is set.
	const stop = effect(() => {
		s.get();
		seen.push(getCurrentOwner());
	});
	// Leave the init call stack: the ambient owner is gone from here on.
	setCurrentOwner(null);

	s.set(1);
	await flush();
	stop();

	assertEquals(seen.length, 2);
	assertEquals(seen[0], owner, "the synchronous first run sees the owner");
	assertEquals(seen[1], owner, "the late re-run re-establishes the same owner, not null");
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
