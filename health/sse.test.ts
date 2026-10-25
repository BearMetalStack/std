import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { sseFrame, sseResponse, wantsStream } from "./sse.ts";

async function readUntil(reader: ReadableStreamDefaultReader<string>, needle: string) {
	let text = "";
	while (!text.includes(needle)) {
		const { value, done } = await reader.read();
		if (done) break;
		text += value;
	}
	return text;
}

Deno.test("sseFrame encodes objects and splits multi-line data", () => {
	assertEquals(sseFrame({ a: 1 }), 'data: {"a":1}\n\n');
	assertEquals(sseFrame("x\ny", "log"), "event: log\ndata: x\ndata: y\n\n");
});

Deno.test("sseResponse sends events and heartbeats, and cleans up on cancel", async () => {
	let cleaned = 0;
	const res = sseResponse((send) => {
		send({ hello: "world" });
		return () => cleaned++;
	}, { heartbeat: 5 });
	assertEquals(res.headers.get("content-type"), "text/event-stream");

	const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
	const text = await readUntil(reader, ": ping");
	assertStringIncludes(text, 'data: {"hello":"world"}');
	await reader.cancel();
	assertEquals(cleaned, 1);
});

Deno.test("aborting the signal closes the stream and cleans up once", async () => {
	const ctl = new AbortController();
	let cleaned = 0;
	const res = sseResponse(() => () => cleaned++, { signal: ctl.signal });
	const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
	await readUntil(reader, "connected");
	ctl.abort();
	assert((await reader.read()).done);
	assertEquals(cleaned, 1);
});

Deno.test("wantsStream reads ?stream or the Accept header", () => {
	const u = (s: string) => new URL(`http://x/m${s}`);
	assert(wantsStream(new Request("http://x"), u("?stream")));
	assert(wantsStream(new Request("http://x", { headers: { accept: "text/event-stream" } }), u("")));
	assert(!wantsStream(new Request("http://x"), u("")));
});
