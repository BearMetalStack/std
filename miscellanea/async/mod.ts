/**
 * @module Async coordination primitives
 */

/**
 * A FIFO async mutex: every call to {@linkcode Mutex.run} waits for the ones queued before it to
 * settle, then runs. A rejection settles the slot like a resolution does, so one failed task never
 * wedges the queue.
 *
 * ```ts
 * const lock = new Mutex();
 * await Promise.all([lock.run(writeA), lock.run(writeB)]); // writeB starts after writeA settles
 * ```
 */
export class Mutex {
	#queue: Promise<unknown> = Promise.resolve();
	#pending = 0;

	/** Queues `fn` behind every task already queued and resolves or rejects with its result. */
	run<T>(fn: () => T | Promise<T>): Promise<T> {
		this.#pending++;
		const result = this.#queue.then(fn, fn);
		this.#queue = result.then(
			() => void this.#pending--,
			() => void this.#pending--,
		);
		return result;
	}

	/** Whether a task is running or queued. */
	get locked(): boolean {
		return this.#pending > 0;
	}

	/** How many tasks are running or queued. */
	get pending(): number {
		return this.#pending;
	}

	/** Resolves once every task queued so far has settled. */
	idle(): Promise<void> {
		return this.#queue.then(() => undefined);
	}
}
