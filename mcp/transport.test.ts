import { assert, assertEquals } from "@std/assert";
import { StdioTransport } from "./transport.ts";
import type { JsonRpcMessage } from "./types.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
}

class CaptureWriter {
	readonly chunks: string[] = [];
	writeSync(bytes: Uint8Array): number {
		this.chunks.push(decoder.decode(bytes));
		return bytes.length;
	}
	get lines(): string[] {
		return this.chunks.join("").split("\n").filter(Boolean);
	}
}

Deno.test("stdio reassembles messages split across chunk boundaries", async () => {
	const received: JsonRpcMessage[] = [];
	const transport = new StdioTransport({
		input: streamOf(
			'{"jsonrpc":"2.0","i',
			'd":1,"method":"ping"}\n{"jsonrpc":"2.0","method":"x"}\n',
		),
		output: new CaptureWriter(),
	});

	transport.start((message) => {
		received.push(message);
	});
	await transport.closed;

	assertEquals(received, [
		{ jsonrpc: "2.0", id: 1, method: "ping" },
		{ jsonrpc: "2.0", method: "x" },
	]);
});

Deno.test("stdio reports malformed lines instead of delivering them", async () => {
	const received: JsonRpcMessage[] = [];
	const invalid: string[] = [];
	const transport = new StdioTransport({
		input: streamOf(
			'not json\n{"jsonrpc":"1.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n',
		),
		output: new CaptureWriter(),
	});
	transport.onInvalid = (raw) => invalid.push(raw);

	transport.start((message) => {
		received.push(message);
	});
	await transport.closed;

	assertEquals(invalid.length, 2);
	assertEquals(received, [{ jsonrpc: "2.0", id: 2, method: "ping" }]);
});

Deno.test("stdio writes exactly one line per message", () => {
	const output = new CaptureWriter();
	const transport = new StdioTransport({ input: streamOf(), output });

	transport.send({ jsonrpc: "2.0", id: 1, result: { text: "has\na newline" } });
	transport.send({ jsonrpc: "2.0", method: "notifications/initialized" });

	assertEquals(output.lines.length, 2);
	assert(output.chunks.join("").endsWith("\n"));
	assertEquals(JSON.parse(output.lines[0]).result.text, "has\na newline");
});

Deno.test("stdio ignores blank lines and trailing whitespace", async () => {
	const received: JsonRpcMessage[] = [];
	const transport = new StdioTransport({
		input: streamOf('\n  \n{"jsonrpc":"2.0","id":1,"method":"ping"}  \r\n'),
		output: new CaptureWriter(),
	});

	transport.start((message) => {
		received.push(message);
	});
	await transport.closed;

	assertEquals(received, [{ jsonrpc: "2.0", id: 1, method: "ping" }]);
});
