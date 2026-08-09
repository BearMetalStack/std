import { assertEquals, assertRejects } from "@std/assert";
import { cliAlert, cliConfirm, cliPrompt, NotInteractiveError } from "./prompts.ts";
import { selectMenuInteractive } from "./select.ts";
import { BufferWriter, FakeKeyReader } from "./testing.ts";
import { type CliSession, startCliSession } from "./render/mod.ts";
import { setColorEnabled, stripAnsi } from "./style.ts";

setColorEnabled(false);

interface Harness {
	session: CliSession;
	keys: FakeKeyReader;
	out: BufferWriter;
	[Symbol.dispose](): void;
}

function harness(columns = 80, rows = 24, isTTY = true): Harness {
	const out = new BufferWriter(columns, rows, { isTTY });
	const keys = new FakeKeyReader();
	const session = startCliSession({ writer: out, reader: keys, interrupt: "event" });
	return {
		session,
		keys,
		out,
		[Symbol.dispose]: () => session.cleanup(),
	};
}

/** Lets the widget mount before keys are delivered. */
const settled = () => new Promise<void>((r) => setTimeout(r, 0));

Deno.test("cliPrompt returns the typed value and collapses to a summary", async () => {
	using h = harness();
	const answer = cliPrompt("Name?", { session: h.session });
	await settled();

	assertEquals(h.out.lines(), ["Name?"]);
	h.keys.type("bearmetal");
	assertEquals(h.out.lines(), ["Name? bearmetal"]);

	h.keys.press("enter");
	assertEquals(await answer, "bearmetal");
	assertEquals(h.out.lines(), ["Name? bearmetal"]);
});

Deno.test("cliPrompt falls back to the default when left empty", async () => {
	using h = harness();
	const answer = cliPrompt("Name?", { session: h.session, default: "my-app" });
	await settled();

	h.keys.press("enter");
	assertEquals(await answer, "my-app");
});

Deno.test("cliPrompt edits text with backspace and the arrows", async () => {
	using h = harness();
	const answer = cliPrompt("Name?", { session: h.session });
	await settled();

	h.keys.type("bearmetl");
	h.keys.press("backspace");
	h.keys.type("al");
	assertEquals(h.out.line(0), "Name? bearmetal");

	h.keys.press("left");
	h.keys.press("left");
	h.keys.type("X");
	assertEquals(h.out.line(0), "Name? bearmetXal");

	h.keys.press("enter");
	assertEquals(await answer, "bearmetXal");
});

Deno.test("backspace at position zero does nothing", async () => {
	using h = harness();
	const answer = cliPrompt("Name?", { session: h.session });
	await settled();

	h.keys.press("backspace");
	h.keys.press("backspace");
	h.keys.type("ok");
	h.keys.press("enter");

	assertEquals(await answer, "ok");
});

Deno.test("delete removes the character under the cursor", async () => {
	using h = harness();
	const answer = cliPrompt("Name?", { session: h.session });
	await settled();

	h.keys.type("abc");
	h.keys.press("home");
	h.keys.press("delete");
	h.keys.press("enter");

	assertEquals(await answer, "bc");
});

Deno.test("readline bindings move and cut", async () => {
	using h = harness();
	const answer = cliPrompt("Name?", { session: h.session });
	await settled();

	h.keys.type("hello world");
	h.keys.press("char", { char: "w", ctrl: true }); // cut previous word
	h.keys.press("char", { char: "a", ctrl: true }); // to start
	h.keys.type(">");
	h.keys.press("enter");

	assertEquals(await answer, ">hello ");
});

Deno.test("ctrl+u cuts to the start of the line", async () => {
	using h = harness();
	const answer = cliPrompt("Name?", { session: h.session });
	await settled();

	h.keys.type("throwaway");
	h.keys.press("char", { char: "u", ctrl: true });
	h.keys.type("kept");
	h.keys.press("enter");

	assertEquals(await answer, "kept");
});

Deno.test("a pasted newline does not submit the prompt", async () => {
	using h = harness();
	const answer = cliPrompt("Name?", { session: h.session });
	await settled();

	h.keys.press("paste", { text: "one\ntwo" });
	assertEquals(h.out.line(0), "Name? one two");

	h.keys.press("enter");
	assertEquals(await answer, "one two");
});

Deno.test("cliPrompt scrolls horizontally instead of wrapping", async () => {
	using h = harness(20, 24);
	const answer = cliPrompt("N?", { session: h.session });
	await settled();

	h.keys.type("abcdefghijklmnopqrstuvwxyz");
	// One row, always — a prompt that grew a second row would move its own anchor.
	assertEquals(h.out.lines().length, 1);
	assertEquals(h.out.line(0).length <= 20, true);

	h.keys.press("enter");
	assertEquals(await answer, "abcdefghijklmnopqrstuvwxyz");
});

Deno.test("validate re-prompts and clears the error on the next key", async () => {
	using h = harness();
	const answer = cliPrompt("Port?", {
		session: h.session,
		validate: (v) => (/^\d+$/.test(v) ? null : "must be a number"),
	});
	await settled();

	h.keys.type("abc");
	h.keys.press("enter");
	assertEquals(h.out.lines()[1].includes("must be a number"), true);

	h.keys.press("char", { char: "u", ctrl: true });
	h.keys.type("8080");
	assertEquals(h.out.lines().length, 1);

	h.keys.press("enter");
	assertEquals(await answer, "8080");
});

Deno.test("cliConfirm only accepts letters that spell yes or no", async () => {
	using h = harness();
	const answer = cliConfirm("Proceed?", false, { session: h.session });
	await settled();

	// "q" and "x" cannot begin either word, so they are dropped.
	h.keys.type("qxye");
	assertEquals(stripAnsi(h.out.line(0)).endsWith("ye"), true);

	h.keys.type("s");
	h.keys.press("enter");
	assertEquals(await answer, true);
});

Deno.test("cliConfirm returns its default on an empty answer", async () => {
	using h = harness();
	const answer = cliConfirm("Proceed?", true, { session: h.session });
	await settled();

	h.keys.press("enter");
	assertEquals(await answer, true);
});

Deno.test("cliAlert ignores typing and waits for enter", async () => {
	using h = harness();
	const done = cliAlert("Heads up.", { session: h.session });
	await settled();

	h.keys.type("ignored");
	assertEquals(stripAnsi(h.out.line(0)).includes("ignored"), false);

	h.keys.press("enter");
	await done;
});

Deno.test("consecutive prompts leave a clean transcript", async () => {
	using h = harness();

	const first = cliPrompt("One?", { session: h.session });
	await settled();
	h.keys.type("a");
	h.keys.press("enter");
	assertEquals(await first, "a");

	const second = cliPrompt("Two?", { session: h.session });
	await settled();
	h.keys.type("b");
	h.keys.press("enter");
	assertEquals(await second, "b");

	assertEquals(h.out.lines(), ["One? a", "Two? b"]);
});

Deno.test("printed output between prompts survives", async () => {
	// The doAColor.ts pattern: print, prompt, print, prompt.
	using h = harness();

	const first = cliPrompt("Colour?", { session: h.session });
	await settled();
	h.keys.type("red");
	h.keys.press("enter");
	await first;

	h.out.write("swatch line\r\n");

	const second = cliPrompt("Stop?", { session: h.session });
	await settled();
	h.keys.type("500");
	h.keys.press("enter");
	await second;

	assertEquals(h.out.lines(), ["Colour? red", "swatch line", "Stop? 500"]);
});

Deno.test("a non-TTY session emits no escape codes", async () => {
	using h = harness(80, 24, false);
	assertEquals(h.session.mode, "plain");

	await assertRejects(
		() => selectMenuInteractive("Pick", ["a", "b"], { session: h.session }),
		NotInteractiveError,
	);
	assertEquals(h.out.raw.includes("\x1b"), false);
});
