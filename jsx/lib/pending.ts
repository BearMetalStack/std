/**
 * Async work a server render has to wait for.
 *
 * Rendering is synchronous. That is deliberate and it is what makes one runtime
 * serve both sides: a component builds its tree the same way in a browser and
 * on a server, with no `await` anywhere in the JSX call graph and no async
 * duplicate of every component. But a server still has to do asynchronous work
 * — load a row, read a file — before the markup it sends is worth sending.
 *
 * The two are reconciled by separating them. The render pass runs to completion
 * and *registers* its promises here instead of awaiting them; the renderer then
 * awaits the batch and lets the signal graph patch the tree it already built.
 * Anything the first pass could not know is filled in by reactivity, not by a
 * second render.
 *
 * ## Why a scope rather than an ambient list
 *
 * Two requests can be in flight at once, and both would otherwise pile into the
 * same list — so a render opens a scope and work registered while it is
 * collecting belongs to that scope. Collection is only ever opened around a
 * *synchronous* segment, which nothing can interleave with, so this needs no
 * async context tracking to be correct.
 *
 * Work registered when no segment is collecting — from inside a `serverInit()`
 * after its first `await`, say — cannot be attributed, so it is given to every
 * render still in flight. Over-awaiting is harmless (a render waits slightly
 * longer than it had to); dropping the work would not be, since the markup
 * would ship without it.
 *
 * On a client nothing is ever in flight, so every function here costs one
 * `Set.size` check and returns.
 */

/** One server render's collection of outstanding work. */
export interface RenderScope {
	readonly work: Set<Promise<unknown>>;
}

const live = new Set<RenderScope>();
let collecting: RenderScope | null = null;

/**
 * Opens a scope for one server render.
 *
 * Pair with {@linkcode endRenderScope} in a `finally` — a scope left live
 * attributes stray work to a render that has already finished.
 */
export function beginRenderScope(): RenderScope {
	const scope: RenderScope = { work: new Set() };
	live.add(scope);
	return scope;
}

/** Closes a scope opened by {@linkcode beginRenderScope}. */
export function endRenderScope(scope: RenderScope): void {
	live.delete(scope);
	if (collecting === scope) collecting = null;
}

/**
 * Runs `fn` with `scope` collecting, and returns the work registered during it.
 *
 * `fn` must be synchronous. The returned set is drained as it is read, so each
 * call yields only work that is new since the last one — which is what lets a
 * renderer loop until a render stops producing any.
 */
export function collectInto<T>(scope: RenderScope, fn: () => T): { result: T; work: Promise<unknown>[] } {
	const previous = collecting;
	collecting = scope;
	try {
		const result = fn();
		const work = [...scope.work];
		scope.work.clear();
		return { result, work };
	} finally {
		collecting = previous;
	}
}

/**
 * Registers a promise the current server render must settle before serializing.
 *
 * A no-op in a browser, and safe to call from anywhere — component code does
 * not have to know which side it is running on.
 */
export function trackPending(work: Promise<unknown>): void {
	if (collecting) {
		collecting.work.add(work);
		return;
	}
	for (const scope of live) scope.work.add(work);
}

/** Whether a server render is currently building its tree. */
export function isServerRendering(): boolean {
	return collecting !== null;
}
