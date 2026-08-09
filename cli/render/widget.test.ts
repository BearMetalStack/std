import { assertEquals, assertRejects } from "@std/assert";
import { runWidget, startCliSession, WidgetCancelledError } from "./mod.ts";
import { BufferWriter, FakeKeyReader } from "../testing.ts";
import { setColorEnabled } from "../style.ts";

setColorEnabled(false);

const settled = () => new Promise<void>((r) => setTimeout(r, 0));

Deno.test("tearing down a session cancels its live widget", async () => {
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	const session = startCliSession({ writer: out, reader: keys, interrupt: "event" });

	const pending = runWidget<string>({
		session,
		frame: () => ["live"],
		onKey: () => {},
	});
	await settled();
	assertEquals(out.lines(), ["live"]);

	session.cleanup();

	await assertRejects(() => pending, WidgetCancelledError);
	// The frame comes down with it.
	assertEquals(out.lines(), []);
});

Deno.test("a cancelled widget never produces an unhandled rejection", async () => {
	// Nothing awaits `pending` here on purpose. Without an internal handler this
	// crashes the process instead of letting it exit — which is what happens on the
	// signal-driven restore path, where the awaiting stack is already gone.
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	const session = startCliSession({ writer: out, reader: keys, interrupt: "event" });

	runWidget<string>({ session, frame: () => ["live"], onKey: () => {} });
	await settled();
	session.cleanup();
	await settled();
});

Deno.test("a frame taller than the terminal is clamped rather than thrown", async () => {
	const out = new BufferWriter(80, 3);
	const keys = new FakeKeyReader();
	using _session = startCliSession({ writer: out, reader: keys, interrupt: "event" });

	const pending = runWidget<string>({
		session: _session,
		frame: () => ["a", "b", "c", "d", "e", "f"],
		onKey: (event, ctl) => {
			if (event.name === "enter") ctl.resolve("done");
		},
	});
	await settled();

	assertEquals(out.lines(), ["a", "b"]);
	keys.press("enter");
	assertEquals(await pending, "done");
});
