import { Signal } from "@signals";
import { getCurrentOwner, isServerRendering, setCurrentOwner, setEffectImpl } from "@bearmetal/jsx";
import type { SignalOf } from "./types.ts";

let needsFlush = true;
const watcher = new Signal.subtle.Watcher(() => {
	if (needsFlush) {
		needsFlush = false;
		queueMicrotask(scheduledFlush);
	}
});

/**
 * One pass over the dirty effects.
 *
 * Deliberately does not loop. Anything an effect dirties while this is running
 * is left for the next microtask, which is what makes "a signal written from
 * inside an effect does not notify its readers" true — a constraint the router
 * and every store in this stack are built around, pinned by a test in
 * `signals.test.ts`.
 */
function flushPass(): void {
	needsFlush = true;
	for (const s of watcher.getPending()) {
		s.get();
	}
	watcher.watch();
}

/**
 * The scheduled flush, which stands aside during a server render.
 *
 * A `serverInit()` writing a signal notifies the watcher, which queues a
 * microtask — and that microtask fires in the gap before the renderer resumes,
 * because awaiting is what put us in the gap. Effects would then run outside
 * the render's collecting, URL-scoped segment: components connecting there
 * would take the *browser* path and a `<Router>` among them would find no URL
 * to match. So while a render is in flight, the renderer owns when effects run;
 * it flushes them itself, in scope. `needsFlush` stays set, so the next write
 * queues another pass and nothing is stranded once the render is over.
 */
function scheduledFlush(): void {
	if (isServerRendering()) {
		needsFlush = true;
		return;
	}
	flushPass();
}

/**
 * How many times {@linkcode flushEffects} goes round before deciding the graph
 * is not going to settle. Reached only when an effect dirties something a later
 * pass reads — a cycle, which would otherwise spin forever.
 */
const MAX_FLUSH_PASSES = 100;

/**
 * Runs every dirty effect now, instead of on the next microtask, and keeps
 * going until none are left.
 *
 * Batching effects into a microtask is right in a browser and wrong for a
 * server render, which has to hand back finished markup — and "finished" means
 * the graph has stopped moving. Calling this after awaiting a batch of
 * `serverInit()`s is what turns the state they wrote into DOM before it is
 * serialized.
 *
 * This loops where the scheduled flush does not, which is the one place a
 * signal written from inside an effect *does* reach its readers. That is not a
 * second set of rules for the server: a browser gets the same result, one
 * microtask later. Here there is no later.
 */
export function flushEffects(): void {
	for (let pass = 0; pass < MAX_FLUSH_PASSES; pass++) {
		if (watcher.getPending().length === 0) return;
		flushPass();
	}
	console.warn(
		`flushEffects() gave up after ${MAX_FLUSH_PASSES} passes — an effect keeps dirtying ` +
			"something a later effect reads. Look for a signal written from inside an effect " +
			"that another effect depends on.",
	);
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
	// Untracked: creating an effect is not itself a read that whatever computation
	// happens to be running should depend on. Skipping this leaks a producer edge
	// to the *ambient* active consumer when `effect()` is invoked reentrantly — e.g.
	// a child component's `connectedCallback` (and its own `addEffect`) firing
	// synchronously during a parent's render effect, via DOM insertion inside that
	// effect's body. The child's own effect would then be wired as a spurious live
	// dependency of the parent's, and any later change reachable from the child's
	// internals would dirty (and eventually force a real recompute of) the parent.
	Signal.subtle.untrack(() => computed.get());

	return () => {
		watcher.unwatch(computed);
		if (typeof cleanup === "function") cleanup();
	};
}

// The JSX runtime carries no reactivity of its own — it calls out to whatever
// effect implementation has been registered, which is what keeps it a rendering
// library rather than a framework. Registering here rather than in `BMElement`
// means anything that reaches signals gets a reactive runtime, including a
// server render that never constructs a component.
setEffectImpl(effect);

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
