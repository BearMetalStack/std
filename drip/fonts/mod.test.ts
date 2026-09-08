import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Theme } from "../types.ts";
import {
	fontFaceCSS,
	isSelfHosted,
	selfHostedFonts,
	themeFontFaceCSS,
	themeFontKeys,
} from "./mod.ts";

Deno.test("selfHostedFonts lists the bundled families", () => {
	assertEquals([...selfHostedFonts].sort(), ["comfortaa", "monofur"]);
});

Deno.test("fontFaceCSS emits inlined @font-face rules for known families", () => {
	const css = fontFaceCSS(["monofur"]);
	assertStringIncludes(css, "@font-face");
	assertStringIncludes(css, 'font-family:"Monofur"');
	assertStringIncludes(css, "data:font/woff2;base64,");
	// Regular / Bold / Italic
	assertEquals(css.match(/@font-face/g)?.length, 3);
});

Deno.test("fontFaceCSS ignores families Drip does not host", () => {
	assertEquals(fontFaceCSS(["Helvetica"]), "");
	assertEquals(fontFaceCSS([]), "");
});

Deno.test("fontFaceCSS accepts a full font-family stack and is case-insensitive", () => {
	const css = fontFaceCSS(['"Comfortaa", system-ui, sans-serif']);
	assertStringIncludes(css, 'font-family:"Comfortaa"');
	assertEquals(fontFaceCSS(["COMFORTAA"]), css);
});

Deno.test("fontFaceCSS dedupes and orders by manifest", () => {
	const css = fontFaceCSS(["monofur", "comfortaa", "monofur"]);
	assert(css.indexOf('"Comfortaa"') < css.indexOf('"Monofur"'));
	assertEquals(css, fontFaceCSS(["comfortaa", "monofur"]));
});

Deno.test("isSelfHosted checks the lead family", () => {
	assert(isSelfHosted("Monofur"));
	assert(isSelfHosted('"Comfortaa", system-ui'));
	assert(!isSelfHosted("Arial, Monofur"));
});

Deno.test("themeFontKeys reads a theme's font roles", () => {
	const theme: Theme = {
		font: {
			sans: '"Comfortaa", system-ui',
			mono: '"Monofur", ui-monospace',
			serif: '"Georgia", serif',
		},
	} as unknown as Theme;
	assertEquals(themeFontKeys(theme).sort(), ["comfortaa", "monofur"]);
	assertStringIncludes(themeFontFaceCSS(theme), 'font-family:"Monofur"');
});

Deno.test("themeFontKeys is empty for a theme naming no bundled font", () => {
	const theme: Theme = { font: { sans: "Helvetica, Arial, sans-serif" } } as unknown as Theme;
	assertEquals(themeFontKeys(theme), []);
	assertEquals(themeFontFaceCSS(theme), "");
	assertStringIncludes(themeFontFaceCSS(theme, ["monofur"]), 'font-family:"Monofur"');
});
