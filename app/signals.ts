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
