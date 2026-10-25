/**
 * Sends one value to the client as a server-sent event. Objects are JSON-encoded.
 */
export type SseSend = (data: unknown, event?: string) => void;

/** Options for {@link sseResponse}. */
export interface SseOptions {
	/** Milliseconds between comment pings that keep proxies from closing the stream. */
	heartbeat?: number;
	/** Aborting this closes the stream, as if the client had gone away. */
	signal?: AbortSignal;
	headers?: HeadersInit;
}

const encoder = new TextEncoder();

/** Formats one SSE frame. Multi-line data is split into one `data:` line per line. */
export function sseFrame(data: unknown, event?: string): string {
	const text = typeof data === "string" ? data : JSON.stringify(data);
	const lines = text.split(/\r?\n/).map((l) => `data: ${l}`).join("\n");
	return `${event ? `event: ${event}\n` : ""}${lines}\n\n`;
}

/**
 * Builds a `text/event-stream` response. `start` gets a `send` function and may return a cleanup
 * function, which runs exactly once when the client disconnects or `signal` aborts.
 */
export function sseResponse(
	start: (send: SseSend) => void | (() => void),
	{ heartbeat = 15_000, signal, headers }: SseOptions = {},
): Response {
	let cleanup: (() => void) | void;
	let ping: ReturnType<typeof setInterval> | undefined;
	let closed = false;

	const close = () => {
		if (closed) return;
		closed = true;
		clearInterval(ping);
		signal?.removeEventListener("abort", onAbort);
		cleanup?.();
	};
	let onAbort = () => {};

	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const write = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					close();
				}
			};
			onAbort = () => {
				close();
				try {
					controller.close();
				} catch {
					// already closed
				}
			};
			if (signal?.aborted) return onAbort();
			signal?.addEventListener("abort", onAbort);
			write(": connected\n\n");
			ping = setInterval(() => write(": ping\n\n"), heartbeat);
			cleanup = start((data, event) => write(sseFrame(data, event)));
		},
		cancel() {
			close();
		},
	});

	const h = new Headers(headers);
	h.set("Content-Type", "text/event-stream");
	h.set("Cache-Control", "no-cache");
	h.set("Connection", "keep-alive");
	return new Response(body, { headers: h });
}

/** True when the request asked for an event stream, by `Accept` header or `?stream`. */
export function wantsStream(req: Request, url: URL): boolean {
	return url.searchParams.has("stream") ||
		(req.headers.get("accept") ?? "").includes("text/event-stream");
}
