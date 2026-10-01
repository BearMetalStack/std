import { Signal } from "@signals";
import {
	getCurrentOwner,
	isServerRendering,
	setCurrentOwner,
	setEffectImpl,
	setUntrackImpl,
} from "@bearmetal/jsx";
import type { SignalOf } from "./types.ts";
import { constructingElement } from "./util/construction.ts";

/**
 * How many passes run back to back before deciding the graph is not going to
 * settle. Reached only when an effect dirties something a later pass reads — a
 * cycle, which would otherwise spin forever.
 */
const MAX_FLUSH_PASSES = 100;

let needsFlush = true;
/** Whether a pass is running effects right now. */
let flushing = false;
/** Passes queued back to back by effects dirtying each other, since the last outside write. */
let chainedPasses = 0;

/**
 * Queues a pass for the next microtask. A pass queued by an effect, rather than
 * by an outside write, counts towards the cycle limit.
 */
function schedule(): void {
	if (!flushing) chainedPasses = 0;
	else if (chainedPasses > MAX_FLUSH_PASSES) return;
	else if (++chainedPasses > MAX_FLUSH_PASSES) {
		console.warn(
			`effects dirtied each other for ${MAX_FLUSH_PASSES} passes in a row; stopping until ` +
				"the next outside write. Look for an effect that writes a signal it (or an effect it " +
				"triggers) reads.",
		);
		return;
	}
	needsFlush = false;
	queueMicrotask(scheduledFlush);
}

const watcher = new Signal.subtle.Watcher(() => {
	if (needsFlush) schedule();
});

/**
 * One pass over the dirty effects.
 *
 * Deliberately does not loop: anything an effect dirties while this is running
 * is left for the next microtask. The Watcher is still marked notified for the
 * first pass after an outside write, so a write made by an effect cannot notify
 * it again; this checks for leftovers after re-arming and queues the follow-up
 * itself. Without that, a signal written from inside an effect changed but its
 * readers never re-ran.
 */
function flushPass(): void {
	needsFlush = true;
	flushing = true;
	try {
		for (const s of watcher.getPending()) {
			s.get();
		}
		watcher.watch();
		if (needsFlush && watcher.getPending().length) schedule();
	} finally {
		flushing = false;
	}
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
 * Runs every dirty effect now, instead of on the next microtask, and keeps
 * going until none are left.
 *
 * Batching effects into a microtask is right in a browser and wrong for a
 * server render, which has to hand back finished markup — and "finished" means
 * the graph has stopped moving. Calling this after awaiting a batch of
 * `serverInit()`s is what turns the state they wrote into DOM before it is
 * serialized.
 *
 * This loops synchronously where the scheduled flush spreads its passes over
 * microtasks. Not a second set of rules for the server: a browser gets the same
 * result, one microtask per pass later. Here there is no later.
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

	Signal.subtle.untrack(() => computed.get());

	return () => {
		watcher.unwatch(computed);
		if (typeof cleanup === "function") cleanup();
	};
}

setEffectImpl(effect);
setUntrackImpl(Signal.subtle.untrack);

export function createEffect(init: () => CleanupFn | void): CleanupFn {
	const constructing = constructingElement();
	if (constructing) return constructing.adoptConstructionEffect(init);
	if (!getCurrentOwner()) {
		console.warn(
			"createEffect() called without an owner — cleanup won't be automatic.\n" +
				"Call the returned function to clean up manually, or call createEffect() inside:\n" +
				"  • a BmElement.init() method, or a @define'd element's field initializer\n" +
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
