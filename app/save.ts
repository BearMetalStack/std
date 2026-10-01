/**
 * A debounced save that can be flushed on demand, knows which edit it saved,
 * and is reachable from one global "save everything" call.
 *
 * @module
 */

import { getCurrentOwner } from "@bearmetal/jsx";
import { Signal } from "./signals/wrapper.ts";
import { constructingElement } from "./util/construction.ts";
import { createEffect } from "./signals.ts";

/** Where a {@linkcode SaveTask} is. */
export type SaveStatus =
	/** Nothing has been scheduled yet. */
	| "idle"
	/** An edit is waiting out the debounce. */
	| "pending"
	/** A save is running. */
	| "saving"
	/** The latest edit is saved. */
	| "saved"
	/** The last save failed; the edit it carried is still unsaved. */
	| "error";

/** Options for {@linkcode createSaveTask}. */
export interface SaveTaskOptions {
	/** Quiet time after the last `schedule()` before saving. Defaults to 500. */
	debounceMs?: number;
	/**
	 * Retry a failed save after this long, doubling each time up to 30s, for as
	 * long as the edit stays unsaved. `false` to only retry on the next
	 * `schedule()`/`flush()`. Defaults to 2000.
	 */
	retryMs?: number | false;
	/**
	 * Tie the task to the current component (or the element being constructed)
	 * so it is flushed and disposed when that tears down. Defaults to `true`;
	 * pass `false` for a task a longer-lived host holds across re-renders.
	 */
	owned?: boolean;
	/** For `flushAllSaves()` failure reports. */
	label?: string;
}

/** A debounced, flushable save. See {@linkcode createSaveTask}. */
export interface SaveTask<T> {
	/** Records an edit and (re)starts the debounce. */
	schedule(value: T): void;
	/**
	 * Saves the latest edit now, waiting for any save already running first.
	 * Resolves once the edit that was latest when called is saved, rejects if
	 * saving it fails. Resolves at once when nothing is unsaved.
	 */
	flush(): Promise<void>;
	/** Drops the unsaved edit, if any, and stops the timers. A running save still finishes. */
	cancel(): void;
	/**
	 * Flushes, stops retrying, and removes the task from {@linkcode flushAllSaves}.
	 * A later `schedule()` brings it back.
	 */
	dispose(): Promise<void>;
	/** Where the task is. */
	readonly status: Signal.State<SaveStatus>;
	/** Whether some edit is not saved yet: pending, saving, or failed. */
	readonly dirty: Signal.Computed<boolean>;
	/** The last save's error, cleared by the next success. */
	readonly error: Signal.State<unknown>;
	readonly label?: string;
}

const tasks = new Set<SaveTask<unknown>>();

/**
 * Flushes every live save task. Resolves when all have settled, with the ones
 * that failed — so "save everything" is one call that cannot forget a kind of
 * editor.
 */
export async function flushAllSaves(): Promise<{ task: SaveTask<unknown>; error: unknown }[]> {
	const all = [...tasks];
	const results = await Promise.allSettled(all.map((t) => t.flush()));
	return results.flatMap((r, i) =>
		r.status === "rejected" ? [{ task: all[i], error: r.reason }] : []
	);
}

/** Whether any live save task has an unsaved edit — for a `beforeunload` prompt. */
export function hasUnsavedSaves(): boolean {
	for (const task of tasks) if (Signal.subtle.untrack(() => task.dirty.get())) return true;
	return false;
}

let unloadHooked = false;
function hookUnload(): void {
	if (unloadHooked || typeof globalThis.addEventListener !== "function") return;
	unloadHooked = true;
	// Best effort: a page being hidden may never come back, so start every save
	// now. Nothing here can be awaited.
	globalThis.addEventListener("pagehide", () => void flushAllSaves());
}

/**
 * A debounced save that gets the hard parts right:
 *
 * - **"saved" means this version.** Every `schedule()` is a new edit
 *   generation; a save only marks the task saved if no edit arrived while it
 *   ran. An edit landing mid-save is saved next, not dropped.
 * - **`flush()` waits for a save in flight** before deciding whether there is
 *   anything left to save, so Cmd/Ctrl+S never races the debounce.
 * - **A failure stays dirty**, with the error on {@linkcode SaveTask.error},
 *   and is retried with backoff (see `retryMs`).
 * - **Every task is reachable** from {@linkcode flushAllSaves}, and flushed
 *   (best effort) when the page is hidden.
 *
 * Created inside a component, it is flushed and disposed with the component;
 * pass `{ owned: false }` when something longer-lived holds it.
 *
 * @example
 * ```ts
 * const save = createSaveTask((doc: Doc) => api.put(doc), { debounceMs: 800 });
 * editor.oninput = () => save.schedule(editor.value);
 * shortcuts.on("mod+s", () => flushAllSaves());
 * ```
 */
export function createSaveTask<T>(
	save: (value: T) => unknown | Promise<unknown>,
	options: SaveTaskOptions = {},
): SaveTask<T> {
	const { debounceMs = 500, retryMs = 2000, owned = true, label } = options;

	const status = new Signal.State<SaveStatus>("idle");
	const error = new Signal.State<unknown>(undefined);
	const dirty = new Signal.Computed(() => {
		const s = status.get();
		return s === "pending" || s === "saving" || s === "error";
	});

	let latest: T | undefined;
	let latestGen = 0;
	let savedGen = 0;
	let inflight: Promise<unknown> | null = null;
	let debounce: ReturnType<typeof setTimeout> | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;
	let retryDelay = retryMs === false ? 0 : retryMs;

	const clearTimers = () => {
		clearTimeout(debounce);
		clearTimeout(retry);
		debounce = retry = undefined;
	};

	const scheduleRetry = () => {
		if (retryMs === false || !tasks.has(task as SaveTask<unknown>)) return;
		clearTimeout(retry);
		retry = setTimeout(() => void run().catch(() => {}), retryDelay);
		retryDelay = Math.min(retryDelay * 2, 30_000);
	};

	/** Saves until nothing newer than the last save is left, or a save fails. */
	const run = async (): Promise<void> => {
		clearTimers();
		const target = latestGen;
		while (true) {
			if (inflight) {
				await inflight.catch(() => {});
				continue;
			}
			if (savedGen >= target) {
				if (latestGen && savedGen >= latestGen && !inflight) status.set("saved");
				return;
			}
			const gen = latestGen;
			const value = latest as T;
			status.set("saving");
			const attempt = (async () => await save(value))();
			inflight = attempt;
			try {
				await attempt;
				savedGen = Math.max(savedGen, gen);
				error.set(undefined);
				retryDelay = retryMs === false ? 0 : retryMs;
			} catch (e) {
				error.set(e);
				status.set("error");
				scheduleRetry();
				throw e;
			} finally {
				if (inflight === attempt) inflight = null;
			}
			if (savedGen < latestGen && !debounce) status.set("pending");
		}
	};

	const task: SaveTask<T> = {
		schedule(value: T) {
			tasks.add(task as SaveTask<unknown>);
			latest = value;
			latestGen++;
			status.set("pending");
			clearTimers();
			debounce = setTimeout(() => {
				debounce = undefined;
				void run().catch(() => {});
			}, debounceMs);
		},
		flush: () => run(),
		cancel() {
			clearTimers();
			savedGen = latestGen;
			status.set(inflight ? "saving" : savedGen ? "saved" : "idle");
			error.set(undefined);
		},
		async dispose() {
			try {
				await run();
			} finally {
				clearTimers();
				tasks.delete(task as SaveTask<unknown>);
			}
		},
		status,
		dirty,
		error,
		label,
	};

	tasks.add(task as SaveTask<unknown>);
	hookUnload();

	// Torn down with the owner — and, for an element, restarted on reconnect —
	// which is exactly an effect's lifetime, so ride on one.
	if (owned && (constructingElement() || getCurrentOwner())) {
		createEffect(() => () => void task.dispose().catch(() => {}));
	}

	return task;
}
