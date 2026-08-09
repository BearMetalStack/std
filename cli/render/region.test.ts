import { assertEquals, assertThrows } from "@std/assert";
import { Region, RegionOverflowError } from "./region.ts";
import { BufferWriter } from "../testing.ts";
import { colorize, displayWidth, setColorEnabled, stripAnsi } from "../style.ts";

setColorEnabled(true);

Deno.test("first paint writes the frame and parks on its last row", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["one", "two", "three"]);

	assertEquals(out.lines(), ["one", "two", "three"]);
	assertEquals(region.height, 3);
	// End of the last content row — not the row below it.
	assertEquals(out.screen.cursor, { row: 2, col: 5 });
});

Deno.test("repaint of equal height replaces content in place", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["one", "two", "three"]);
	region.render(["ONE", "TWO", "THREE"]);

	assertEquals(out.lines(), ["ONE", "TWO", "THREE"]);
	assertEquals(region.height, 3);
});

Deno.test("shrinking a frame blanks the rows it gave up", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["one", "two", "three"]);
	region.render(["only"]);

	// Rows 1 and 2 must not still show "two"/"three".
	assertEquals(out.lines(), ["only"]);
	assertEquals(region.height, 1);
	assertEquals(out.screen.cursor.row, 0);
});

Deno.test("growing a frame paints the new rows", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["only"]);
	region.render(["one", "two", "three"]);

	assertEquals(out.lines(), ["one", "two", "three"]);
	assertEquals(region.height, 3);
});

Deno.test("a shorter line does not leave the previous line's tail behind", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["a long line of text"]);
	region.render(["short"]);

	assertEquals(out.lines(), ["short"]);
});

Deno.test("clear erases the region and returns to where it began", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["one", "two", "three"]);
	region.clear();

	assertEquals(out.lines(), []);
	assertEquals(region.height, 0);
	assertEquals(out.screen.cursor, { row: 0, col: 0 });

	// Ordinary output now lands on the region's former top row.
	out.write("after");
	assertEquals(out.lines(), ["after"]);
});

Deno.test("clear is a no-op on an unrendered region", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);
	region.clear();
	assertEquals(out.raw, "");
});

Deno.test("commit collapses the frame to a summary line", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["? Pick one", "  a", "> b", "  c"]);
	region.commit(["? Pick one - b"]);

	assertEquals(out.lines(), ["? Pick one - b"]);
	assertEquals(region.closed, true);
	// Cursor parked at column 0 of a fresh row, where console.log expects it.
	assertEquals(out.screen.cursor, { row: 1, col: 0 });
});

Deno.test("output after commit flows below the summary", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["? Pick", "> a"]);
	region.commit(["? Pick - a"]);
	out.write("next line\r\n");

	assertEquals(out.lines(), ["? Pick - a", "next line"]);
});

Deno.test("a region opens below already-printed output and leaves it intact", () => {
	// The doAColor.ts case: a colour ramp is printed, a menu renders under it,
	// and the ramp must still be on screen when the menu collapses.
	const out = new BufferWriter(80, 24);
	out.write("ramp row one\r\nramp row two\r\n");

	const region = new Region(out);
	region.render(["? Look good?", "> yes", "  no"]);
	assertEquals(out.lines(), ["ramp row one", "ramp row two", "? Look good?", "> yes", "  no"]);

	region.commit(["? Look good? - yes"]);
	assertEquals(out.lines(), ["ramp row one", "ramp row two", "? Look good? - yes"]);
});

Deno.test("cursorTo places the cursor inside the region", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["name: ", "hint"]);
	region.cursorTo(0, 6);
	assertEquals(out.screen.cursor, { row: 0, col: 6 });

	region.cursorTo(1, 2);
	assertEquals(out.screen.cursor, { row: 1, col: 2 });
});

Deno.test("a repaint after cursorTo still lands correctly", () => {
	// The rewind is computed from where the cursor actually is, so moving it
	// mid-frame must not desynchronise the next paint.
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["one", "two", "three"]);
	region.cursorTo(0, 1);
	region.render(["ONE", "TWO", "THREE"]);

	assertEquals(out.lines(), ["ONE", "TWO", "THREE"]);
});

Deno.test("truncation keeps one row per line", () => {
	const out = new BufferWriter(10, 24);
	const region = new Region(out);

	region.render(["a".repeat(25)]);

	assertEquals(region.height, 1);
	assertEquals(out.line(0), "a".repeat(10));
});

Deno.test("truncation preserves styling and closes it", () => {
	const out = new BufferWriter(10, 24);
	const region = new Region(out);

	region.render([colorize("a".repeat(25), "red")]);

	assertEquals(region.height, 1);
	assertEquals(out.line(0), "a".repeat(10));
	assertEquals(stripAnsi(region.rows[0]), "a".repeat(10));
});

Deno.test("wrap mode counts continuation rows", () => {
	const out = new BufferWriter(10, 24);
	const region = new Region(out, { wrap: true });

	region.render(["a".repeat(25)]);

	assertEquals(region.height, 3);
	assertEquals(out.line(0), "a".repeat(10));
	assertEquals(out.line(1), "a".repeat(10));
	assertEquals(out.line(2), "a".repeat(5));
});

Deno.test("wrap mode repaints across continuation rows", () => {
	const out = new BufferWriter(10, 24);
	const region = new Region(out, { wrap: true });

	region.render(["a".repeat(25)]);
	region.render(["b".repeat(5)]);

	assertEquals(region.height, 1);
	assertEquals(out.lines(), ["bbbbb"]);
});

Deno.test("wrap mode carries styling onto continuation rows", () => {
	const out = new BufferWriter(10, 24);
	const region = new Region(out, { wrap: true });

	region.render([colorize("a".repeat(25), "red")]);

	for (const row of region.rows) {
		assertEquals(stripAnsi(row).length <= 10, true);
	}
	assertEquals(region.rows.every((r) => r.includes("\x1b[31m")), true);
});

Deno.test("a frame taller than the terminal is refused", () => {
	const out = new BufferWriter(80, 5);
	const region = new Region(out);

	// Four rows fit (one is reserved); five do not.
	region.render(["1", "2", "3", "4"]);
	assertThrows(
		() => region.render(["1", "2", "3", "4", "5"]),
		RegionOverflowError,
	);
});

Deno.test("rendering an empty frame clears the region", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["one", "two"]);
	region.render([]);

	assertEquals(out.lines(), []);
	assertEquals(region.height, 0);
});

Deno.test("forget drops bookkeeping without emitting anything", () => {
	const out = new BufferWriter(80, 24);
	const region = new Region(out);

	region.render(["one", "two"]);
	const before = out.raw;
	region.forget();

	assertEquals(out.raw, before);
	assertEquals(region.height, 0);
});

Deno.test("dispose clears a region that was never committed", () => {
	const out = new BufferWriter(80, 24);
	{
		using region = new Region(out);
		region.render(["transient"]);
	}
	assertEquals(out.lines(), []);
});

Deno.test("dispose leaves a committed region alone", () => {
	const out = new BufferWriter(80, 24);
	{
		using region = new Region(out);
		region.render(["live"]);
		region.commit(["summary"]);
	}
	assertEquals(out.lines(), ["summary"]);
});

Deno.test("a non-TTY writer emits no escapes and only commits", () => {
	const out = new BufferWriter(80, 24, { isTTY: false });
	const region = new Region(out);

	region.render(["? Name", "> typing"]);
	assertEquals(out.raw, "");

	region.commit(["? Name - typed"]);
	assertEquals(out.raw, "? Name - typed\n");
	// Zero escape bytes: safe to redirect into a file.
	assertEquals(out.raw.includes("\x1b"), false);
});

Deno.test("wide characters are measured, not counted", () => {
	const out = new BufferWriter(10, 24);
	const region = new Region(out, { wrap: true });

	// Five double-width glyphs exactly fill a 10-column row.
	region.render(["日本語日本"]);
	assertEquals(region.height, 1);

	region.render(["日本語日本語"]);
	assertEquals(region.height, 2);
	assertEquals(displayWidth(region.rows[0]), 10);
});
