/**
 * @module
 * Transports for `@bearmetal/mcp`. {@linkcode StdioTransport} implements the
 * newline-delimited stdio framing from the MCP specification;
 * {@linkcode MemoryTransport} wires two peers together in-process, which is how
 * the test-suite drives a server.
 */

import { asMessage } from "./jsonrpc.ts";
import type { JsonRpcMessage, MessageHandler, Transport } from "./types.ts";

const encoder = new TextEncoder();

/**
 * stdio transport: reads newline-delimited JSON from stdin, writes it to stdout.
 *
 * Nothing but JSON-RPC may ever reach stdout on this transport — send
 * diagnostics to stderr (see {@linkcode logToStderr}) or through the protocol's
 * own `notifications/message`.
 */
export class StdioTransport implements Transport {
	#reader: ReadableStream<Uint8Array>;
	#writer: { writeSync(p: Uint8Array): number };
	#handler: MessageHandler | null = null;
	#buffer = "";
	#decoder = new TextDecoder();
	#done: PromiseWithResolvers<void> = Promise.withResolvers<void>();
	#closed = false;

	onInvalid?: (raw: string, error: unknown) => void;

	constructor(
		options: {
			input?: ReadableStream<Uint8Array>;
			output?: { writeSync(p: Uint8Array): number };
		} = {},
	) {
		this.#reader = options.input ?? Deno.stdin.readable;
		this.#writer = options.output ?? Deno.stdout;
	}

	get closed(): Promise<void> {
		return this.#done.promise;
	}

	start(handler: MessageHandler): void {
		if (this.#handler) throw new Error("StdioTransport is already started");
		this.#handler = handler;
		void this.#pump();
	}

	async #pump(): Promise<void> {
		try {
			for await (const chunk of this.#reader) {
				this.#buffer += this.#decoder.decode(chunk, { stream: true });
				let index: number;
				while ((index = this.#buffer.indexOf("\n")) !== -1) {
					const line = this.#buffer.slice(0, index).trim();
					this.#buffer = this.#buffer.slice(index + 1);
					if (line) await this.#deliver(line);
				}
			}
		} catch (error) {
			if (!this.#closed) this.onInvalid?.("", error);
		} finally {
			this.#closed = true;
			this.#done.resolve();
		}
	}

	async #deliver(line: string): Promise<void> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			this.onInvalid?.(line, error);
			return;
		}
		const message = asMessage(parsed);
		if (!message) {
			this.onInvalid?.(line, new Error("Not a valid JSON-RPC 2.0 message"));
			return;
		}
		await this.#handler?.(message);
	}

	send(message: JsonRpcMessage): void {
		if (this.#closed) return;
		const bytes = encoder.encode(JSON.stringify(message) + "\n");
		let offset = 0;
		while (offset < bytes.length) {
			offset += this.#writer.writeSync(bytes.subarray(offset));
		}
	}

	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		void this.#reader.cancel().catch(() => {});
		this.#done.resolve();
	}
}

/**
 * An in-process transport. {@linkcode MemoryTransport.pair} returns two ends of
 * the same channel — hand one to a server and drive the other from a test or an
 * embedded client.
 */
export class MemoryTransport implements Transport {
	#peer: MemoryTransport | null = null;
	#handler: MessageHandler | null = null;
	#queue: JsonRpcMessage[] = [];
	#done: PromiseWithResolvers<void> = Promise.withResolvers<void>();
	#closed = false;

	onInvalid?: (raw: string, error: unknown) => void;

	/** Two transports that deliver each other's messages. */
	static pair(): [MemoryTransport, MemoryTransport] {
		const a = new MemoryTransport();
		const b = new MemoryTransport();
		a.#peer = b;
		b.#peer = a;
		return [a, b];
	}

	get closed(): Promise<void> {
		return this.#done.promise;
	}

	start(handler: MessageHandler): void {
		this.#handler = handler;
		const pending = this.#queue;
		this.#queue = [];
		for (const message of pending) void handler(message);
	}

	send(message: JsonRpcMessage): void {
		if (this.#closed) return;
		this.#peer?.receive(JSON.parse(JSON.stringify(message)) as JsonRpcMessage);
	}

	/** Deliver a message to this end of the channel as though the peer sent it. */
	receive(message: JsonRpcMessage): void {
		if (this.#closed) return;
		if (this.#handler) void this.#handler(message);
		else this.#queue.push(message);
	}

	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#done.resolve();
		this.#peer?.close();
	}
}

/**
 * Write a diagnostic line to stderr. Safe on a stdio server, where stdout is
 * reserved for protocol traffic.
 */
export function logToStderr(...args: unknown[]): void {
	console.error(...args);
}
