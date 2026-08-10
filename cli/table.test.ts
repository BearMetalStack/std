import { assertEquals } from "@std/assert";
import { definitionList, table } from "./table.ts";
import { colorize, displayWidth, setColorEnabled } from "./style.ts";

Deno.test("columns align to the widest cell", () => {
	setColorEnabled(false);
	const out = table([["a", "one"], ["bbbb", "two"]], { width: 40 });
	assertEquals(out.split("\n"), [
		"a     one",
		"bbbb  two",
	]);
});

Deno.test("headers get a rule under them", () => {
	setColorEnabled(false);
	const out = table([["chapter", "Manage chapters"]], {
		headers: ["command", "summary"],
		width: 40,
	});
	assertEquals(out.split("\n"), [
		"command  summary",
		"───────  ───────────────",
		"chapter  Manage chapters",
	]);
});

Deno.test("alignment is honoured per column", () => {
	setColorEnabled(false);
	const out = table([["a", "1"], ["b", "200"]], {
		columns: [{}, { align: "right" }],
		width: 40,
	});
	assertEquals(out.split("\n"), [
		"a    1",
		"b  200",
	]);
});

Deno.test("widths are measured on display columns, not bytes", () => {
	// This is the whole reason the helper exists: `padEnd` on a styled string pads by escape
	// length and produces a ragged column.
	setColorEnabled(true);
	const out = table([[colorize("a", "red"), "x"], ["bbbb", "y"]], { width: 40 });
	const [first, second] = out.split("\n");
	assertEquals(displayWidth(first), displayWidth(second));
	setColorEnabled(false);
});

Deno.test("a wide character counts as two columns", () => {
	setColorEnabled(false);
	const out = table([["熊", "bear"], ["ab", "pair"]], { width: 40 });
	const [first, second] = out.split("\n");
	assertEquals(displayWidth(first), displayWidth(second));
});

Deno.test("columns are squeezed to fit the width budget", () => {
	setColorEnabled(false);
	const out = table([["short", "a very long description that will not fit in the budget"]], {
		width: 30,
	});
	for (const line of out.split("\n")) {
		assertEquals(displayWidth(line) <= 30, true, `"${line}" is ${displayWidth(line)} wide`);
	}
	assertEquals(out.includes("…"), true);
});

Deno.test("minWidth keeps a column from being squeezed away", () => {
	setColorEnabled(false);
	const out = table([["aaaaaaaaaa", "bbbbbbbbbb"]], {
		width: 14,
		columns: [{ minWidth: 8 }, {}],
	});
	assertEquals(out.startsWith("aaaaaaa…"), true);
});

Deno.test("maxWidth truncates before any squeezing happens", () => {
	setColorEnabled(false);
	const out = table([["aaaaaaaaaaaa", "x"]], { width: 80, columns: [{ maxWidth: 5 }, {}] });
	assertEquals(out, "aaaa…  x");
});

Deno.test("trailing padding is trimmed so lines do not wrap early", () => {
	setColorEnabled(false);
	const out = table([["a", "one"], ["bbbb", ""]], { width: 40 });
	assertEquals(out.split("\n")[1], "bbbb");
});

Deno.test("indent shifts the whole block and comes out of the budget", () => {
	setColorEnabled(false);
	const out = table([["a", "b"]], { width: 20, indent: 4 });
	assertEquals(out, "    a  b");
});

Deno.test("definitionList renders key/value pairs", () => {
	setColorEnabled(false);
	const out = definitionList([["name", "my-app"], ["database", "postgres"]], { width: 40 });
	assertEquals(out.split("\n"), [
		"name      my-app",
		"database  postgres",
	]);
});

Deno.test("an empty table is an empty string", () => {
	assertEquals(table([]), "");
});
