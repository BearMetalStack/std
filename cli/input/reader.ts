/**
 * Ownership of stdin for interactive use.
 *
 * One loop, for the life of the process, refcounted by claims. When nothing is
 * claiming input the loop parks on a promise rather than on a read — a pending
 * `Deno.stdin.read()` keeps the event loop alive and cannot be observed to stop,
 * whereas an unresolved promise costs nothing and lets the process exit normally.
 *
 * That difference is the whole reason this file exists. The previous design
 * started a fresh read loop per activation and had no way to interrupt a parked
 * read, so releasing input outside a key dispatch left the old loop waiting while
 * the next claim started a second one — two readers on one stdin, splitting
 * keystrokes between them.
 * @module
 */

import { KeyDecoder, type KeyEvent } from "./keys.ts";

/** Receives every decoded key while subscribed. */
export type KeyHandler = (event: KeyEvent) => void;

/**
 * How long to wait before deciding a lone `ESC` really was the Escape key.
 *
 * Escape is a prefix of every arrow and function key, so it can only be resolved
 * by the absence of what would follow.
 */
const ESC_FLUSH_MS = 30;

const READ_BUFFER = 4096;

/**
 * Where a session gets its keys.
 *
 * {@linkcode KeyReader} is the real one; tests substitute a fake. Sessions depend
 * on this rather than the class so that substitution does not require a terminal.
 */
export interface KeySource {
	readonly active: boolean;
	subscribe(handler: KeyHandler): () => void;
	claim(token: object): void;
	release(token: object): void;
	/** Returns the terminal to cooked mode immediately. */
	suspendRaw(): void;
	/** Interrupts a read in flight. */
	interrupt(): boolean;
}

/** Reads and decodes keys from stdin, for as long as anything claims it. */
export class KeyReader implements KeySource {
	#claims = new Set<object>();
	#handlers = new Set<KeyHandler>();
	#decoder = new KeyDecoder();
	#buffer = new Uint8Array(READ_BUFFER);
	#running = false;
	#stopped = false;
	#resume: (() => void) | null = null;
	#raw = false;
	#interruptSpent = false;
	#escTimer: ReturnType<typeof setTimeout> | null = null;

	/** Whether anything currently holds a claim on input. */
	get active(): boolean {
		return this.#claims.size > 0;
	}

	/** Registers a handler, returning an unsubscribe function. */
	subscribe(handler: KeyHandler): () => void {
		this.#handlers.add(handler);
		return () => this.#handlers.delete(handler);
	}

	/** Takes a claim on stdin, starting or waking the loop. */
	claim(token: object) {
		if (this.#stopped) return;
		this.#claims.add(token);
		if (!this.#running) {
			this.#running = true;
			this.#loop();
			return;
		}
		const resume = this.#resume;
		this.#resume = null;
		resume?.();
	}

	/**
	 * Drops a claim.
	 *
	 * When this is the last one — and it almost always happens synchronously inside
	 * a key dispatch, because Enter is what resolves a widget — the loop observes
	 * zero claims before issuing its next read and parks. No read is left pending,
	 * so nothing is swallowed and nothing holds the process open.
	 */
	release(token: object) {
		this.#claims.delete(token);
	}

	/**
	 * Interrupts a read that is genuinely in flight.
	 *
	 * Only needed when input is cancelled from outside a keypress — a timeout, an
	 * abort signal, a programmatic dismiss. `Deno.stdin.readable` is memoized and
	 * closes once cancelled, so this works exactly once per process; a second call
	 * is a no-op. That is acceptable because the second such cancel in a process
	 * essentially always coincides with shutdown.
	 *
	 * @returns whether the interrupt was actually spent.
	 */
	interrupt(): boolean {
		if (this.#interruptSpent) return false;
		this.#interruptSpent = true;
		try {
			Deno.stdin.readable.cancel().catch(() => {});
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Returns the terminal to cooked mode immediately, without stopping the loop.
	 *
	 * Releasing the last claim gets there eventually, but only once the loop wakes.
	 * A caller restoring the terminal on its way to `Deno.exit` cannot wait for
	 * that, or it exits with the terminal still in raw mode.
	 */
	suspendRaw() {
		this.#setRaw(false);
	}

	/** Stops the loop and restores cooked mode. */
	stop() {
		this.#stopped = true;
		this.#claims.clear();
		this.#clearEscTimer();
		const resume = this.#resume;
		this.#resume = null;
		resume?.();
		this.#setRaw(false);
	}

	async #loop() {
		while (!this.#stopped) {
			if (this.#claims.size === 0) {
				this.#clearEscTimer();
				this.#setRaw(false);
				await new Promise<void>((resolve) => {
					this.#resume = resolve;
				});
				this.#resume = null;
				if (this.#stopped) break;
				this.#decoder.reset();
				this.#setRaw(true);
			}

			let n: number | null;
			try {
				n = await Deno.stdin.read(this.#buffer);
			} catch (error) {
				const name = (error as Error)?.name;
				if (name === "Interrupted" || name === "BadResource") continue;
				throw error;
			}
			if (n === null) break;

			this.#clearEscTimer();
			for (const event of this.#decoder.push(this.#buffer.subarray(0, n))) {
				this.#dispatch(event);
			}
			this.#armEscTimer();
		}

		this.#running = false;
		this.#clearEscTimer();
		this.#setRaw(false);
	}

	#dispatch(event: KeyEvent) {
		for (const handler of [...this.#handlers]) {
			try {
				handler(event);
			} catch (error) {
				console.error(error);
			}
		}
	}

	#armEscTimer() {
		if (!this.#decoder.pending || this.#claims.size === 0) return;
		this.#escTimer = setTimeout(() => {
			this.#escTimer = null;
			for (const event of this.#decoder.flush()) this.#dispatch(event);
		}, ESC_FLUSH_MS);
	}

	#clearEscTimer() {
		if (this.#escTimer !== null) {
			clearTimeout(this.#escTimer);
			this.#escTimer = null;
		}
	}

	#setRaw(on: boolean) {
		if (this.#raw === on) return;
		try {
			if (!Deno.stdin.isTerminal()) return;
			Deno.stdin.setRaw(on);
			this.#raw = on;
		} catch {
			// Not a terminal, or stdin is gone. Either way there is no raw mode to set.
		}
	}
}

let shared: KeyReader | null = null;

/** The process-wide stdin reader. */
export function keyReader(): KeyReader {
	return shared ??= new KeyReader();
}
