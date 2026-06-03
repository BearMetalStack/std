import { Signal } from "@bearmetal/app/signals";

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

	const computed = new Signal.Computed(() => {
		if (typeof cleanup === "function") cleanup();
		cleanup = fn();
	});

	watcher.watch(computed);
	computed.get();

	return () => {
		watcher.unwatch(computed);
		if (typeof cleanup === "function") cleanup();
	};
}
