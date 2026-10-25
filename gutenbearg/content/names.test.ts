import { assertEquals } from "@std/assert";
import { between, formatName, nextNumber, parseName, respace, titleize } from "./names.ts";

Deno.test("names: numbered, with and without an icon", () => {
	assertEquals(parseName("0016-[rocket]-start-here"), {
		order: 16,
		numbered: true,
		icon: "rocket",
		slug: "start-here",
	});
	assertEquals(parseName("0000-signal.md"), {
		order: 0,
		numbered: true,
		icon: undefined,
		slug: "signal",
	});
});

Deno.test("names: unnumbered sort last", () => {
	assertEquals(parseName("[gear]-misc"), {
		order: Infinity,
		numbered: false,
		icon: "gear",
		slug: "misc",
	});
	assertEquals(parseName("notes.md").order, Infinity);
});

Deno.test("names: format inverts parse", () => {
	for (const name of ["0016-[rocket]-start-here", "0032-signal.md", "1024-x"]) {
		const p = parseName(name);
		assertEquals(
			formatName(p.order, p.slug, { icon: p.icon, ext: name.endsWith(".md") ? ".md" : "" }),
			name,
		);
	}
});

Deno.test("numbers: append, insert, and run out", () => {
	assertEquals(nextNumber(), 0);
	assertEquals(nextNumber(32), 48);
	assertEquals(between(undefined, undefined), 0);
	assertEquals(between(16, undefined), 32);
	assertEquals(between(0, 16), 8);
	assertEquals(between(0, 1), null);
	assertEquals(between(undefined, 16), 7);
	assertEquals(between(undefined, 0), null);
	assertEquals(respace(4), [0, 16, 32, 48]);
	assertEquals(respace(2, 10), [0, 10]);
});

Deno.test("titleize", () => {
	assertEquals(titleize("start-here"), "Start here");
	assertEquals(titleize("data_loading"), "Data loading");
});
