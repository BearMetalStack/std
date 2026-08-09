/**
 * Interactive code, tested without a terminal.
 *
 * `BufferWriter` interprets the escape sequences it is handed into a character
 * grid, so assertions are about what the screen shows rather than which control
 * codes were emitted. `FakeKeyReader` stands in for stdin, and — like the real
 * reader — only delivers keys while a widget holds focus, so a test that forgets
 * to start the widget fails the same way production would.
 * @module
 */

import { assertEquals } from "@std/assert";
import { cliPrompt, selectMenuInteractive, startCliSession } from "@bearmetal/cli";
import { BufferWriter, FakeKeyReader } from "@bearmetal/cli/testing";

import { runKeyInspector } from "./keys.ts";
import { runProgress } from "./progress.ts";

function harness(columns = 80, rows = 24) {
	const out = new BufferWriter(columns, rows);
	const keys = new FakeKeyReader();
	const session = startCliSession({ writer: out, reader: keys });
	return { out, keys, session };
}

Deno.test("cliPrompt collapses to a summary line", async () => {
	const { out, keys, session } = harness();

	// Start the widget, *then* type: the promise has to be pending for the key
	// reader to have anything focused.
	const answer = cliPrompt("Project name?", { session });
	keys.type("bearmetal");
	keys.press("enter");

	assertEquals(await answer, "bearmetal");
	assertEquals(out.line(0), "Project name? bearmetal");
	session.cleanup();
});

Deno.test("a filter rejects characters before they land", async () => {
	const { keys, session } = harness();

	const answer = cliPrompt("Slug?", {
		session,
		filter: (char) => /[a-z-]/.test(char),
	});
	keys.type("My App!");
	keys.press("enter");

	// Uppercase, the space and the bang never reached the buffer.
	assertEquals(await answer, "ypp");
	session.cleanup();
});

Deno.test("a validator re-asks instead of resolving", async () => {
	const { out, keys, session } = harness();

	const answer = cliPrompt("Name?", {
		session,
		validate: (value) => value.length >= 3 ? null : "too short",
	});

	keys.type("ab");
	keys.press("enter");
	assertEquals(out.line(1).includes("too short"), true);

	keys.type("c");
	keys.press("enter");
	assertEquals(await answer, "abc");
	session.cleanup();
});

Deno.test("select returns the value, not the label", async () => {
	const { keys, session } = harness();

	const chosen = selectMenuInteractive("Database?", [
		["Postgres", "postgres"],
		["Deno KV", "kv"],
	], { session });

	keys.press("down");
	keys.press("enter");

	assertEquals(await chosen, "kv");
	session.cleanup();
});

Deno.test("escape dismisses a menu", async () => {
	const { keys, session } = harness();

	const chosen = selectMenuInteractive("Database?", ["postgres", "kv"], { session });
	keys.press("escape");

	assertEquals(await chosen, null);
	session.cleanup();
});

Deno.test("the key inspector records what it was sent", async () => {
	const { out, keys, session } = harness();

	const done = runKeyInspector(session);
	keys.type("hi");
	keys.press("up");
	keys.press("escape");

	assertEquals(await done, 0);
	assertEquals(out.line(0), "keys - 3 events seen");
	session.cleanup();
});

Deno.test("progress leaves only its committed summary behind", async () => {
	const { out, session } = harness();

	assertEquals(await runProgress(session, ["one", "two"], 0), 0);

	// `session.log` goes to the real console — it is ordinary output that happens
	// to be sequenced around the frame. Only what the region itself wrote lands in
	// the writer, and after `commit` that is just the summary: no half-erased bar,
	// no leftover rows.
	assertEquals(out.lines().filter(Boolean), ["✓ 2 steps complete"]);
	session.cleanup();
});
