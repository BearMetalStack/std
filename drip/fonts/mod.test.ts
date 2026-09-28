import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Theme } from "../types.ts";
import {
	fontFaceCSS,
	fontFile,
	fontFiles,
	fontHref,
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

Deno.test("fontFaceCSS links faces when given an href", () => {
	const css = fontFaceCSS(["monofur"], { href: "/fonts/" });
	assertEquals(css.match(/@font-face/g)?.length, 3);
	assert(!css.includes("data:"));
	assertStringIncludes(css, 'src:url("/fonts/monofur/Monofur-Regular.woff2") format("woff2")');
	assertStringIncludes(css, "font-display:swap");
	assertStringIncludes(css, "font-style:italic");
});

Deno.test("fontHref joins a base path and takes a function", () => {
	assertEquals(fontHref("/fonts", "a/b.woff2"), "/fonts/a/b.woff2");
	assertEquals(fontHref("/fonts/", "a/b.woff2"), "/fonts/a/b.woff2");
	assertEquals(
		fontHref((f) => `https://cdn.example/${f}?v=2`, "a/b.woff2"),
		"https://cdn.example/a/b.woff2?v=2",
	);
	assertStringIncludes(
		fontFaceCSS(["comfortaa"], { href: (f) => `/x/${f}` }),
		'url("/x/comfortaa/Comfortaa.woff2")',
	);
});

Deno.test("linked and inlined sheets declare the same faces", () => {
	const strip = (css: string) => css.replace(/src:url\("[^"]*"\)/g, "src");
	const keys = ["comfortaa", "monofur"];
	assertEquals(strip(fontFaceCSS(keys, { href: "/f/" })), strip(fontFaceCSS(keys)));
});

Deno.test("fontFiles lists every face of the hosted families, in manifest order", () => {
	assertEquals(fontFiles(["monofur", "Helvetica", "comfortaa"]), [
		"comfortaa/Comfortaa.woff2",
		"monofur/Monofur-Regular.woff2",
		"monofur/Monofur-Bold.woff2",
		"monofur/Monofur-Italic.woff2",
	]);
	assertEquals(fontFiles([]), []);
});

Deno.test("fontFile returns the woff2 bytes a linked sheet points to", () => {
	for (const file of fontFiles(selfHostedFonts)) {
		const bytes = fontFile(file);
		assert(bytes, file);
		assertEquals(new TextDecoder().decode(bytes.subarray(0, 4)), "wOF2");
	}
	assertEquals(fontFile("comfortaa/Nope.woff2"), undefined);
	assertEquals(fontFile("toString"), undefined);
});

Deno.test("fontFile matches the inlined data URI", () => {
	const css = fontFaceCSS(["comfortaa"]);
	const b64 = css.match(/base64,([^"]+)/)![1];
	const bytes = fontFile("comfortaa/Comfortaa.woff2")!;
	assertEquals(bytes.length, atob(b64).length);
});
