import { Signal } from "@signals";
import { getCurrentOwner, setCurrentOwner } from "@bearmetal/jsx/client";
import type { SignalOf } from "./types.ts";

let needsFlush = true;
const watcher = new Signal.subtle.Watcher(() => {
	if (needsFlush) {
		needsFlush = false;
		queueMicrotask(flushEffects);
	}
});

function flushEffects() {
	needsFlush = true;
	for (const s of watcher.getPending()) {
		s.get();
	}
	watcher.watch();
}

type CleanupFn = () => void;

export function effect(fn: () => CleanupFn | void): CleanupFn {
	let cleanup: CleanupFn | void;

	// Ownership is a synchronous global that is only set during a component's
	// init call stack. An effect, however, re-runs later inside a microtask
	// flush where that global is back to null — so capture the ambient owner at
	// creation and re-establish it around every run. This makes getCurrentOwner()
	// resolve to the correct owner for anything rendered synchronously within the
	// effect (e.g. a For rendered late by a Switch), exactly as it does at init.
	// The first run happens synchronously during init, where prev === owner, so
	// this is a no-op there; restoring to `prev` (not `owner`) keeps sibling
	// effects flushing in the same microtask from leaking owners onto each other.
	const owner = getCurrentOwner();

	const computed = new Signal.Computed(() => {
		const prev = getCurrentOwner();
		setCurrentOwner(owner);
		try {
			if (typeof cleanup === "function") cleanup();
			cleanup = fn();
		} finally {
			setCurrentOwner(prev);
		}
	});

	watcher.watch(computed);
	computed.get();

	return () => {
		watcher.unwatch(computed);
		if (typeof cleanup === "function") cleanup();
	};
}

export function createEffect(init: () => CleanupFn | void): CleanupFn {
	if (!getCurrentOwner()) {
		console.warn(
			"createEffect() called without an owner — cleanup won't be automatic.\n" +
				"Call the returned function to clean up manually, or call createEffect() inside:\n" +
				"  • a BmElement.init() method\n" +
				"  • an each() render callback",
		);
	}
	const cleanup = effect(init);
	getCurrentOwner()?.registerCleanup(cleanup);
	return cleanup;
}

export function createSignal<T>(init: T): Signal.State<T> {
	return new Signal.State(init);
}

export function createComputed<T>(init: () => T): Signal.Computed<T> {
	// A computed's body can be pulled by the reactive graph outside any effect —
	// notably during the dependency-freshness poll the graph runs before a
	// consuming effect's body, which recomputes dirty producers first. That poll
	// happens outside the effect's owner scope, so a render-bearing computed
	// (Show/Switch) would otherwise re-render with no owner. Capture the ambient
	// owner at creation and re-establish it around the body, same as effect().
	const owner = getCurrentOwner();
	return new Signal.Computed(() => {
		const prev = getCurrentOwner();
		setCurrentOwner(owner);
		try {
			return init();
		} finally {
			setCurrentOwner(prev);
		}
	});
}

export function isSignal<T>(v: SignalOf<T> | unknown): v is SignalOf<T> {
	return Signal.isState(v) || Signal.isComputed(v);
}
