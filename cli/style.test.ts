import { assertEquals } from "@std/assert";
import {
	bgColorize,
	bold,
	colorEnabled,
	colorize,
	displayWidth,
	rowsForLine,
	setColorEnabled,
	stripAnsi,
	truncateToWidth,
} from "./style.ts";

// Colour defaults to off when stdout is not a TTY, which it never is under
// `deno test`. Force it on so the styling helpers actually emit escapes.
setColorEnabled(true);

Deno.test("stripAnsi removes SGR sequences", () => {
	assertEquals(stripAnsi(colorize("hello", "red")), "hello");
	assertEquals(stripAnsi(colorize(bold("hi"), "green")), "hi");
	assertEquals(stripAnsi(bgColorize("bg", "#aa55ee")), "bg");
});

Deno.test("stripAnsi removes non-SGR CSI sequences", () => {
	// The old colour-only regex missed every one of these.
	assertEquals(stripAnsi("\x1b[2Kline"), "line");
	assertEquals(stripAnsi("\x1b[?25lhidden\x1b[?25h"), "hidden");
	assertEquals(stripAnsi("\x1b[3A\x1b[12Gmoved"), "moved");
	assertEquals(stripAnsi("\x1b[1;5Amod"), "mod");
});

Deno.test("stripAnsi removes OSC, DCS and SS3 sequences", () => {
	assertEquals(stripAnsi("\x1b]8;;https://example.com\x07label\x1b]8;;\x07"), "label");
	assertEquals(stripAnsi("\x1b]0;window title\x1b\\body"), "body");
	assertEquals(stripAnsi("\x1bP1$r0m\x1b\\dcs"), "dcs");
	assertEquals(stripAnsi("\x1bOAss3"), "ss3");
});

Deno.test("displayWidth ignores escapes", () => {
	assertEquals(displayWidth("hello"), 5);
	assertEquals(displayWidth(colorize("hello", "red")), 5);
	assertEquals(displayWidth(colorize(bold("hello"), "red")), 5);
	assertEquals(displayWidth("\x1b[2K\x1b[?25lhello"), 5);
});

Deno.test("displayWidth counts CJK as two columns", () => {
	assertEquals(displayWidth("日本語"), 6);
	assertEquals(displayWidth("ａｂ"), 4); // fullwidth latin
	assertEquals(displayWidth("한글"), 4);
});

Deno.test("displayWidth measures grapheme clusters once", () => {
	assertEquals(displayWidth("é"), 1); // e + combining acute
	assertEquals(displayWidth("é"), 1); // precomposed
	assertEquals(displayWidth("🙂"), 2);
	assertEquals(displayWidth("👨‍👩‍👧‍👦"), 2); // ZWJ family, one cluster
	assertEquals(displayWidth("🇬🇧"), 2); // regional indicator pair
});

Deno.test("displayWidth honours the emoji variation selector", () => {
	assertEquals(displayWidth("✔"), 1); // text presentation
	assertEquals(displayWidth("✔️"), 2); // forced emoji presentation
});

Deno.test("displayWidth treats control characters as zero-width", () => {
	assertEquals(displayWidth("a\x00b"), 2);
	assertEquals(displayWidth("a\x07b"), 2);
});

Deno.test("truncateToWidth passes short text through untouched", () => {
	const styled = colorize("hello", "red");
	assertEquals(truncateToWidth(styled, 10), styled);
	assertEquals(truncateToWidth("hello", 5), "hello");
});

Deno.test("truncateToWidth cuts plain text to the budget", () => {
	assertEquals(truncateToWidth("hello world", 5), "hello");
	assertEquals(truncateToWidth("hello world", 0), "");
});

Deno.test("truncateToWidth never splits an escape sequence", () => {
	const out = truncateToWidth(colorize("hello world", "red"), 5);
	assertEquals(stripAnsi(out), "hello");
	// A half-written escape would leave a stray "[" or digits in the plain text.
	assertEquals(out.includes("\x1b[31m"), true);
});

Deno.test("truncateToWidth closes styling it leaves open", () => {
	const out = truncateToWidth(colorize("hello world", "red"), 5);
	assertEquals(out.endsWith("\x1b[0m") || out.endsWith("\x1b[39m"), true);
});

Deno.test("truncateToWidth does not append a reset to unstyled text", () => {
	assertEquals(truncateToWidth("hello world", 5), "hello");
});

Deno.test("truncateToWidth drops a wide cluster that would straddle the limit", () => {
	// "日本" is 4 columns; a 3-column budget can only fit the first.
	assertEquals(truncateToWidth("日本", 3), "日");
	assertEquals(truncateToWidth("日本", 4), "日本");
});

Deno.test("truncateToWidth accounts for the ellipsis", () => {
	assertEquals(truncateToWidth("hello world", 8, "…"), "hello w…");
	assertEquals(displayWidth(truncateToWidth("hello world", 8, "…")), 8);
});

Deno.test("rowsForLine counts wrapped rows", () => {
	assertEquals(rowsForLine("", 10), 1);
	assertEquals(rowsForLine("abc", 10), 1);
	assertEquals(rowsForLine("a".repeat(10), 10), 1);
	assertEquals(rowsForLine("a".repeat(11), 10), 2);
	assertEquals(rowsForLine("a".repeat(25), 10), 3);
	// Escapes must not inflate the row count.
	assertEquals(rowsForLine(colorize("a".repeat(5), "red"), 10), 1);
});

Deno.test("setColorEnabled(false) makes every helper a pass-through", () => {
	setColorEnabled(false);
	try {
		assertEquals(colorEnabled(), false);
		assertEquals(colorize("hello", "red"), "hello");
		assertEquals(colorize("hello", "#ff0000"), "hello");
		assertEquals(bgColorize("hello", "green"), "hello");
		assertEquals(bold("hello"), "hello");
	} finally {
		setColorEnabled(true);
	}
});
