import { Signal } from "@signals";
import {
	getCurrentOwner,
	isServerRendering,
	type Owner,
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
/** Whether a pass is queued and has not started yet. */
let flushQueued = false;
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
	flushQueued = true;
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
			// One effect failing is that effect's problem. Letting the throw out
			// would skip re-arming the watcher below, and with it every effect in
			// the app, until something happened to create a new one.
			try {
				s.get();
			} catch (error) {
				reportEffectError(error);
			}
		}
	} finally {
		watcher.watch();
		// Still inside the pass, so a follow-up queued here counts towards the cycle limit.
		if (needsFlush && watcher.getPending().length) schedule();
		flushing = false;
	}
	drainAfterFlush();
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
	flushQueued = false;
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

const afterFlushQueue: CleanupFn[] = [];

/**
 * Runs `fn` once the effects have stopped moving: after the pass in flight and
 * any follow-up passes it queued, or on the next microtask if none is coming.
 *
 * One microtask is not enough to know a node has really left. A pass that
 * removes a node can dirty an effect that puts it back, and that effect runs
 * in the *next* pass, a microtask later. Teardown waits for the graph to
 * settle so that is still seen as a move.
 */
export function afterFlush(fn: CleanupFn): void {
	afterFlushQueue.push(fn);
	queueMicrotask(drainAfterFlush);
}

function drainAfterFlush(): void {
	// A pass still to come drains the queue when it is done.
	if (flushQueued || flushing) return;
	while (afterFlushQueue.length) {
		try {
			afterFlushQueue.shift()!();
		} catch (error) {
			reportEffectError(error);
		}
	}
}

/**
 * Reports an error thrown by an effect re-run by the scheduler. There is no
 * caller to hand it to, so it goes where an uncaught error would — without
 * taking the rest of the pass down with it.
 */
function reportEffectError(error: unknown): void {
	console.error("effect threw:", error);
}

export function effect(fn: () => CleanupFn | void): CleanupFn {
	let cleanup: CleanupFn | void;

	const owner = getCurrentOwner();

	const computed = new Signal.Computed(() => {
		const prev = getCurrentOwner();
		setCurrentOwner(owner);
		try {
			// What the previous run's teardown reads is not a dependency of this run.
			if (typeof cleanup === "function") Signal.subtle.untrack(cleanup);
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

/** An owner that collects cleanups into `into`, forwarding refs to `parent`. */
function scopeOwner(parent: Owner, into: CleanupFn[]): NonNullable<Owner> {
	return {
		registerCleanup: (fn) => into.push(fn),
		registerRef: parent?.registerRef?.bind(parent),
		get refs() {
			return parent?.refs;
		},
	};
}

function release(cleanups: CleanupFn[]): void {
	Signal.subtle.untrack(() => {
		for (const fn of cleanups) {
			try {
				fn();
			} catch (error) {
				reportEffectError(error);
			}
		}
	});
}

/**
 * A computed that owns what it builds.
 *
 * Each evaluation runs under its own scope: effects, `each()` lists and
 * bindings created while it runs are registered there, not on the component.
 * When a later evaluation produces a **different** value, the previous scope
 * is released, because whatever it built has just been replaced. When it
 * produces the **same** value (a cached node handed back again), the previous
 * scope is kept, since what it built is still in use. Everything still held
 * is released with the owner the computed was created under.
 *
 * Refs registered while it runs still reach that owner.
 *
 * Something built in one evaluation and handed back by a later one after a
 * different value came in between, a node cached in a field and toggled in
 * and out, has been released by then. Build such a node outside the computed.
 */
export function createComputed<T>(
	init: () => T,
	options?: Signal.Options<T>,
): Signal.Computed<T> {
	const owner = getCurrentOwner();
	let held: CleanupFn[] = [];
	let hasValue = false;
	let last: T | undefined;
	owner?.registerCleanup(() => {
		const all = held;
		held = [];
		hasValue = false;
		last = undefined;
		release(all);
	});
	return new Signal.Computed(() => {
		const fresh: CleanupFn[] = [];
		const prev = getCurrentOwner();
		setCurrentOwner(scopeOwner(owner, fresh));
		let value: T;
		try {
			value = init();
		} catch (error) {
			release(fresh);
			throw error;
		} finally {
			setCurrentOwner(prev);
		}
		if (hasValue && Object.is(value, last)) {
			held.push(...fresh);
		} else {
			const replaced = held;
			held = fresh;
			release(replaced);
		}
		hasValue = true;
		last = value;
		return value;
	}, options);
}

/**
 * A computed that re-establishes its creation-time owner and nothing more:
 * what it builds is registered on that owner directly. For the built-ins that
 * manage their branches' lifetimes themselves (`Show`, `Switch`), where a
 * per-evaluation scope would tear down a branch they mean to keep.
 */
export function createOwnedComputed<T>(init: () => T): Signal.Computed<T> {
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

/**
 * Runs `fn` under a fresh owner that belongs to no component, and hands back
 * its result with the function that tears it down: every effect, list, save
 * task and cleanup registered while `fn` ran (or later, through the owner it
 * was given) goes when `dispose` is called, newest first. `dispose` is safe to
 * call more than once.
 *
 * For things whose lifetime is not a DOM node's: a workspace tab's tool, a
 * cache entry, a background task. `fn` receives `dispose` so it can end
 * itself.
 *
 * @example
 * ```ts
 * const [tool, close] = createScope(() => new ChapterTool(id));
 * // ...the tab closes:
 * close();
 * ```
 */
export function createScope<T>(fn: (dispose: () => void) => T): [T, () => void] {
	let cleanups: CleanupFn[] = [];
	let disposed = false;
	const owner: NonNullable<Owner> = {
		registerCleanup(cleanup) {
			if (disposed) {
				Signal.subtle.untrack(cleanup);
				return;
			}
			cleanups.push(cleanup);
		},
	};
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		const all = cleanups.reverse();
		cleanups = [];
		release(all);
	};
	const prev = getCurrentOwner();
	setCurrentOwner(owner);
	try {
		return [Signal.subtle.untrack(() => fn(dispose)), dispose];
	} catch (error) {
		dispose();
		throw error;
	} finally {
		setCurrentOwner(prev);
	}
}

/**
 * A computed that is handed its own previous value: history a derivation
 * needs, without a variable closed over and mutated from inside it.
 *
 * @example
 * ```ts
 * // The last non-null selection, held while nothing is selected.
 * const lastPicked = createMemo<string | null>((prev) => picked.get() ?? prev ?? null);
 * ```
 */
export function createMemo<T>(
	fn: (prev: T | undefined) => T,
	initial?: T,
	options?: Signal.Options<T>,
): Signal.Computed<T> {
	let prev = initial;
	return createComputed(() => (prev = fn(prev)), options);
}

/**
 * An effect with its dependency spelled out: re-runs `fn` when `source`
 * produces a new value (by `Object.is`), with the previous one. `fn` itself
 * runs untracked, so what it reads or writes never re-runs it. A cleanup it
 * returns runs before the next call and when the watch ends.
 *
 * Owned like {@linkcode createEffect}; returns the function that stops it.
 * Pass `immediate: false` to skip the call for the value `source` starts with.
 *
 * @example
 * ```ts
 * watch(focusedTab, (tab) => { if (tab) latest.set(tab.toolType, tab.uuid); });
 * ```
 */
export function watch<T>(
	source: SignalOf<T> | (() => T),
	fn: (next: T, prev: T | undefined) => CleanupFn | void,
	{ immediate = true }: { immediate?: boolean } = {},
): CleanupFn {
	const value = typeof source === "function" ? createComputed(source) : source;
	let prev: T | undefined;
	let first = true;
	return createEffect(() => {
		const next = value.get();
		const was = prev;
		prev = next;
		if (first) {
			first = false;
			if (!immediate) return;
		}
		return Signal.subtle.untrack(() => fn(next, was));
	});
}

export function isSignal<T>(v: SignalOf<T> | unknown): v is SignalOf<T> {
	return Signal.isState(v) || Signal.isComputed(v);
}
