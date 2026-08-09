import { assertEquals } from "@std/assert";
import { multiSelectMenuInteractive, selectMenuInteractive } from "./select.ts";
import { BufferWriter, FakeKeyReader } from "./testing.ts";
import { type CliSession, startCliSession } from "./render/mod.ts";
import { setColorEnabled } from "./style.ts";

setColorEnabled(false);

interface Harness {
	session: CliSession;
	keys: FakeKeyReader;
	out: BufferWriter;
	[Symbol.dispose](): void;
}

function harness(columns = 80, rows = 24): Harness {
	const out = new BufferWriter(columns, rows);
	const keys = new FakeKeyReader();
	const session = startCliSession({ writer: out, reader: keys, interrupt: "event" });
	return { session, keys, out, [Symbol.dispose]: () => session.cleanup() };
}

const settled = () => new Promise<void>((r) => setTimeout(r, 0));

const FRUIT = ["apple", "banana", "cherry"];

Deno.test("a menu renders inline and collapses to a summary", async () => {
	using h = harness();
	const answer = selectMenuInteractive("Fruit?", FRUIT, { session: h.session });
	await settled();

	assertEquals(h.out.lines(), ["Fruit?", "> 1. apple", "  2. banana", "  3. cherry"]);
	// Crucially, no alternate-screen switch for a list that fits.
	assertEquals(h.out.raw.includes("\x1b[?1049h"), false);

	h.keys.press("enter");
	assertEquals(await answer, "apple");
	assertEquals(h.out.lines(), ["Fruit? - apple"]);
});

Deno.test("arrows move the selection and wrap around", async () => {
	using h = harness();
	const answer = selectMenuInteractive("Fruit?", FRUIT, { session: h.session });
	await settled();

	h.keys.press("down");
	assertEquals(h.out.line(2), "> 2. banana");

	h.keys.press("up");
	h.keys.press("up");
	assertEquals(h.out.line(3), "> 3. cherry");

	h.keys.press("enter");
	assertEquals(await answer, "cherry");
});

Deno.test("escape dismisses the menu and leaves nothing behind", async () => {
	using h = harness();
	const answer = selectMenuInteractive("Fruit?", FRUIT, { session: h.session });
	await settled();

	h.keys.press("escape");
	assertEquals(await answer, null);
	assertEquals(h.out.lines(), []);
});

Deno.test("a menu opens below printed output and preserves it", async () => {
	// The doAColor.ts case that the alternate screen used to destroy.
	using h = harness();
	h.out.write("ramp one\r\nramp two\r\n");

	const answer = selectMenuInteractive("Stop?", ["400", "500"], { session: h.session });
	await settled();
	assertEquals(h.out.lines(), ["ramp one", "ramp two", "Stop?", "> 1. 400", "  2. 500"]);

	h.keys.press("enter");
	assertEquals(await answer, "400");
	assertEquals(h.out.lines(), ["ramp one", "ramp two", "Stop? - 400"]);
});

Deno.test("typing a number jumps to that entry", async () => {
	using h = harness();
	const answer = selectMenuInteractive("Fruit?", FRUIT, { session: h.session });
	await settled();

	h.keys.type("3");
	h.keys.press("enter");
	assertEquals(await answer, "cherry");
});

Deno.test("a [label, value] pair returns its value", async () => {
	using h = harness();
	const answer = selectMenuInteractive("DB?", [["Postgres", "pg"], ["Deno KV", "kv"]], {
		session: h.session,
	});
	await settled();

	h.keys.press("down");
	h.keys.press("enter");
	assertEquals(await answer, "kv");
});

Deno.test("initialSelection starts on the given entry", async () => {
	using h = harness();
	const answer = selectMenuInteractive("Fruit?", FRUIT, {
		session: h.session,
		initialSelection: 1,
	});
	await settled();

	h.keys.press("enter");
	assertEquals(await answer, "banana");
});

Deno.test("a list that fits is windowed to keep the selection visible", async () => {
	// 8 rows total, so 7 available and 6 for options.
	using h = harness(80, 8);
	const many = Array.from({ length: 6 }, (_, i) => `item-${i}`);
	const answer = selectMenuInteractive("Pick", many, { session: h.session });
	await settled();

	assertEquals(h.out.lines().length, 7);
	h.keys.press("enter");
	await answer;
});

Deno.test("a list too tall for the terminal escalates to the alternate screen", async () => {
	using h = harness(80, 10);
	const many = Array.from({ length: 300 }, (_, i) => `item-${i}`);
	const answer = selectMenuInteractive("Pick", many, { session: h.session });
	await settled();

	assertEquals(h.out.raw.includes("\x1b[?1049h"), true);

	h.keys.press("enter");
	assertEquals(await answer, "item-0");
	// Back to the primary buffer, with the summary left in scrollback.
	assertEquals(h.out.raw.includes("\x1b[?1049l"), true);
});

Deno.test("neverEscalate keeps a tall menu inline", async () => {
	using h = harness(80, 10);
	const many = Array.from({ length: 300 }, (_, i) => `item-${i}`);
	const answer = selectMenuInteractive("Pick", many, {
		session: h.session,
		neverEscalate: true,
	});
	await settled();

	assertEquals(h.out.raw.includes("\x1b[?1049h"), false);
	h.keys.press("enter");
	await answer;
});

Deno.test("an explicit alt session never leaves the alternate screen mid-run", async () => {
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	const session = startCliSession({
		writer: out,
		reader: keys,
		mode: "alt",
		interrupt: "event",
	});

	assertEquals(session.mode, "alt");
	assertEquals(out.raw.includes("\x1b[?1049h"), true);

	const answer = selectMenuInteractive("Fruit?", FRUIT, { session });
	await settled();
	keys.press("enter");
	assertEquals(await answer, "apple");

	// Still in the alternate screen — only cleanup leaves it.
	assertEquals(out.raw.split("\x1b[?1049l").length - 1, 0);
	session.cleanup();
	assertEquals(out.raw.includes("\x1b[?1049l"), true);
});

Deno.test("multi-select toggles with space and returns the labels", async () => {
	using h = harness();
	const answer = multiSelectMenuInteractive("Pick some", FRUIT, { session: h.session });
	await settled();

	h.keys.type(" ");
	h.keys.press("down");
	h.keys.press("down");
	h.keys.type(" ");
	h.keys.press("enter");

	assertEquals(await answer, ["apple", "cherry"]);
});

Deno.test("multi-select does not mutate the caller's array", async () => {
	using h = harness();
	const options = [...FRUIT];
	const answer = multiSelectMenuInteractive("Pick some", options, {
		session: h.session,
		allOption: true,
	});
	await settled();

	h.keys.press("enter");
	await answer;
	assertEquals(options, FRUIT);
});

Deno.test("select all checks everything, and unchecking one clears it", async () => {
	using h = harness();
	const answer = multiSelectMenuInteractive("Pick some", FRUIT, {
		session: h.session,
		allOption: true,
	});
	await settled();

	h.keys.type(" "); // Select All
	assertEquals(h.out.lines().slice(1).every((l) => l.includes("◼")), true);

	h.keys.press("down"); // onto "apple"
	h.keys.type(" "); // uncheck it
	assertEquals(h.out.line(1).includes("◻"), true);

	h.keys.press("enter");
	assertEquals(await answer, ["banana", "cherry"]);
});

Deno.test("multi-select escape returns null", async () => {
	using h = harness();
	const answer = multiSelectMenuInteractive("Pick some", FRUIT, { session: h.session });
	await settled();

	h.keys.press("escape");
	assertEquals(await answer, null);
	assertEquals(h.out.lines(), []);
});

Deno.test("a multi-select callback runs for each chosen entry", async () => {
	using h = harness();
	const ran: string[] = [];
	const answer = multiSelectMenuInteractive("Pick some", [
		["alpha", (l) => ran.push(l)],
		["beta", (l) => ran.push(l)],
	], { session: h.session });
	await settled();

	h.keys.type(" ");
	h.keys.press("enter");

	assertEquals(await answer, ["alpha"]);
	assertEquals(ran, ["alpha"]);
});

Deno.test("an empty option list resolves to null without rendering", async () => {
	using h = harness();
	assertEquals(await selectMenuInteractive("Nothing", [], { session: h.session }), null);
	assertEquals(h.out.lines(), []);
});

Deno.test("a terminal too short for the question still renders the menu", async () => {
	// Two rows leaves one usable, which cannot hold both the question and an option.
	// Rendering has to degrade rather than throw out of the keypress.
	using h = harness(80, 2);
	const answer = selectMenuInteractive("Fruit?", FRUIT, { session: h.session });
	await settled();

	assertEquals(h.out.lines().length, 1);
	assertEquals(h.out.line(0).includes("apple"), true);

	h.keys.press("down");
	assertEquals(h.out.line(0).includes("banana"), true);

	h.keys.press("enter");
	assertEquals(await answer, "banana");
});
