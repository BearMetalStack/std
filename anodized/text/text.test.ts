import { assert, assertEquals, assertThrows } from "@std/assert";
import { Font } from "./ttf.ts";
import { layoutText, measureText } from "./layout.ts";

const font = new Font(await Deno.readFile(new URL("../testdata/Vera.ttf", import.meta.url)));

Deno.test("parses Vera's metrics and cmap", () => {
	assertEquals(font.unitsPerEm, 2048);
	assertEquals(font.numGlyphs, 268);
	const A = font.glyphIndex("A".codePointAt(0)!);
	assert(A > 0);
	assertEquals(font.advance(A), 1401);
	assertEquals(font.glyphIndex(0x10ffff), 0);
});

Deno.test("reads kern pairs", () => {
	assert(font.hasKerning);
	const A = font.glyphIndex(65), V = font.glyphIndex(86);
	assert(font.kerning(A, V) < 0);
	assert(measureText(font, "AV", 20) < measureText(font, "A", 20) + measureText(font, "V", 20));
});

Deno.test("outlines simple and composite glyphs", () => {
	const o = font.glyphPath(font.glyphIndex("o".codePointAt(0)!));
	assertEquals(o.verbs.filter((v) => v === 0).length, 2);
	const b = o.bounds();
	assert(b.minY >= -50 && b.maxY > 1000);
	const aUml = font.glyphPath(font.glyphIndex(0xe4));
	assert(aUml.verbs.filter((v) => v === 0).length >= 3, "ä should have the a and two dots");
	assert(font.glyphPath(font.glyphIndex(32)).empty);
});

Deno.test("layout wraps on spaces and breaks long words", () => {
	const l = layoutText(font, "one two three four", { size: 10, maxWidth: 40 });
	assert(l.lines.length >= 2);
	for (const line of l.lines) assert(line.width <= 40 + 1e-9);
	const long = layoutText(font, "supercalifragilistic", { size: 10, maxWidth: 30 });
	assert(long.lines.length > 1);
	assertEquals(layoutText(font, "a\nb").lines.length, 2);
});

Deno.test("rejects CFF fonts with a clear error", () => {
	const fake = new Uint8Array(12);
	fake.set([0x4f, 0x54, 0x54, 0x4f]);
	assertThrows(() => new Font(fake), Error, "CFF");
});
