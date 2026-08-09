import { assertEquals } from "@std/assert";
import { KeyReader } from "./reader.ts";

/**
 * Stands in for `Deno.stdin` so the loop can be observed without a terminal.
 *
 * `isTerminal()` has to answer `true` — `#setRaw` bails out otherwise, which is
 * exactly the condition that hides the bug this file is about.
 */
class FakeStdin {
	readonly rawCalls: boolean[] = [];
	/** Whether raw mode was on at the moment each read was issued. */
	readonly rawAtRead: boolean[] = [];
	#raw = false;
	#queue: Uint8Array[] = [];
	#waiting: ((n: number | null) => void) | null = null;
	#buffer: Uint8Array | null = null;

	isTerminal() {
		return true;
	}

	setRaw(on: boolean) {
		this.rawCalls.push(on);
		this.#raw = on;
	}

	read(buffer: Uint8Array): Promise<number | null> {
		this.rawAtRead.push(this.#raw);
		const next = this.#queue.shift();
		if (next) {
			buffer.set(next);
			return Promise.resolve(next.length);
		}
		this.#buffer = buffer;
		return new Promise((resolve) => {
			this.#waiting = resolve;
		});
	}

	/** Delivers bytes to a read that is already in flight, or queues them. */
	push(text: string) {
		const bytes = new TextEncoder().encode(text);
		const waiting = this.#waiting;
		if (waiting && this.#buffer) {
			this.#buffer.set(bytes);
			this.#waiting = null;
			this.#buffer = null;
			waiting(bytes.length);
			return;
		}
		this.#queue.push(bytes);
	}

	/** Ends the loop by reporting EOF. */
	close() {
		const waiting = this.#waiting;
		this.#waiting = null;
		this.#buffer = null;
		waiting?.(null);
	}
}

const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function withFakeStdin(fn: (stdin: FakeStdin) => Promise<void>) {
	const original = Object.getOwnPropertyDescriptor(Deno, "stdin")!;
	const stdin = new FakeStdin();
	Object.defineProperty(Deno, "stdin", { value: stdin, configurable: true });
	try {
		await fn(stdin);
	} finally {
		Object.defineProperty(Deno, "stdin", original);
	}
}

Deno.test("the very first claim reads in raw mode", async () => {
	await withFakeStdin(async (stdin) => {
		const reader = new KeyReader();
		const seen: string[] = [];
		reader.subscribe((event) => seen.push(event.name));

		// The first claim of a process starts the loop with a claim already held, so
		// it never parks. Raw mode has to be established anyway — otherwise the
		// terminal stays cooked, keys arrive one line at a time, and arrow keys do
		// nothing at all until Enter.
		reader.claim({});
		await settled();

		assertEquals(stdin.rawAtRead, [true]);
		assertEquals(stdin.rawCalls, [true]);

		stdin.push("\x1b[A");
		await settled();
		assertEquals(seen, ["up"]);

		reader.stop();
		stdin.close();
		await settled();
	});
});

Deno.test("raw mode is dropped while nothing holds a claim, and restored after", async () => {
	await withFakeStdin(async (stdin) => {
		const reader = new KeyReader();
		const token = {};

		reader.claim(token);
		await settled();

		// Releasing is observed by the loop on its next pass, which is what a key
		// dispatch provides.
		reader.release(token);
		stdin.push("x");
		await settled();

		assertEquals(stdin.rawCalls, [true, false]);
		assertEquals(reader.active, false);

		reader.claim({});
		await settled();

		assertEquals(stdin.rawCalls, [true, false, true]);
		assertEquals(stdin.rawAtRead.at(-1), true);

		reader.stop();
		stdin.close();
		await settled();
	});
});
