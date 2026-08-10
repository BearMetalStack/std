import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { buildVariantsCss, getThemeVariants } from "./variants.ts";
import { normalizeMediaQuery, validateVariants } from "./validate.ts";
import type { Theme } from "../types.ts";

function theme(): Theme {
	return {
		variants: [
			{
				name: "light",
				default: true,
				rules: { "--color-bg": "#ffffff", "--color-text": "#101014" },
			},
			{
				name: "dark",
				media: "(prefers-color-scheme: dark)",
				rules: { "--color-bg": "#101014", "--color-text": "#ffffff" },
			},
		],
	};
}

Deno.test("variants are read from either the current or the legacy key", () => {
	const legacy: Theme = { "#variants": theme().variants };
	assertEquals(getThemeVariants(legacy).map((v) => v.name), ["light", "dark"]);
	assertEquals(getThemeVariants(theme()).map((v) => v.name), ["light", "dark"]);
});

Deno.test("the default variant sorts first", () => {
	const t: Theme = {
		variants: [
			{ name: "dark", rules: {} },
			{ name: "light", default: true, rules: {} },
		],
	};
	assertEquals(getThemeVariants(t)[0].name, "light");
});

Deno.test("the default variant's rules are emitted once, against a grouped selector", () => {
	const css = buildVariantsCss(theme());
	assertStringIncludes(css, ':root, :root[data-theme="light"] {');
	// The old shape wrote the same block twice; make sure it does not come back.
	assertEquals(css.split("--color-bg: #ffffff").length - 1, 1);
});

Deno.test("a media block excludes the other variants' explicit choices", () => {
	const css = buildVariantsCss(theme());
	assertStringIncludes(css, "@media (prefers-color-scheme: dark) {");
	assertStringIncludes(css, ':root:not([data-theme="light"]) {');
	// ...and the explicit block still exists so `data-theme="dark"` works on a
	// light OS.
	assertStringIncludes(css, ':root[data-theme="dark"] {');
});

Deno.test("the media guard names every other variant", () => {
	const t = theme();
	t.variants!.push({ name: "sepia", rules: { "--color-bg": "#f4ecd8" } });
	const css = buildVariantsCss(t);
	assertStringIncludes(css, ':root:not([data-theme="light"]):not([data-theme="sepia"]) {');
});

Deno.test("output is one declaration per line", () => {
	const css = buildVariantsCss(theme());
	for (const line of css.split("\n")) {
		assert(line.length < 200, `line too long: ${line.slice(0, 80)}…`);
		assertEquals(line.split(";").length - 1 <= 1, true, `more than one declaration: ${line}`);
	}
});

Deno.test("a variant is scoped to the selector it is built for", () => {
	const css = buildVariantsCss(theme(), ".themed");
	assertStringIncludes(css, '.themed, .themed[data-theme="light"] {');
	assert(!css.includes(":root"));
});

Deno.test("normalizeMediaQuery wraps a bare feature test", () => {
	// The failure this guards: `@media prefers-color-scheme: dark {` is invalid,
	// so a browser discards the whole variant and the theme just has no dark mode.
	assertEquals(normalizeMediaQuery("prefers-color-scheme: dark"), "(prefers-color-scheme: dark)");
	assertEquals(normalizeMediaQuery("(prefers-color-scheme: dark)"), "(prefers-color-scheme: dark)");
	assertEquals(
		normalizeMediaQuery("@media (prefers-color-scheme: dark)"),
		"(prefers-color-scheme: dark)",
	);
	assertEquals(normalizeMediaQuery("print"), "print");
});

Deno.test("normalizeMediaQuery rejects what a browser would silently drop", () => {
	assertThrows(() => normalizeMediaQuery(""));
	assertThrows(() => normalizeMediaQuery("   "));
	assertThrows(() => normalizeMediaQuery("(prefers-color-scheme: dark"));
});

Deno.test("a dangling var() reference is reported", () => {
	const diagnostics = validateVariants(
		[{ name: "light", default: true, rules: { "--color-bg": "var(--color-gold-300)" } }],
		new Set(["--color-bg"]),
	);
	const dangling = diagnostics.filter((d) => d.message.includes("--color-gold-300"));
	assertEquals(dangling.length, 1);
	assertEquals(dangling[0].level, "warning");
});

Deno.test("a resolvable reference is not reported", () => {
	const diagnostics = validateVariants(
		[{ name: "light", default: true, rules: { "--color-bg": "var(--color-gold-300)" } }],
		new Set(["--color-bg", "--color-gold-300"]),
	);
	assertEquals(diagnostics.filter((d) => d.message.includes("--color-gold-300")).length, 0);
});

Deno.test("an invalid media query is an error, not a warning", () => {
	const diagnostics = validateVariants(
		[{ name: "dark", media: "(prefers-color-scheme: dark", rules: {} }],
		new Set(),
	);
	const media = diagnostics.filter((d) => d.where.endsWith("media"));
	assertEquals(media.length, 1);
	assertEquals(media[0].level, "error");
});

Deno.test("two default variants are an error", () => {
	const diagnostics = validateVariants(
		[
			{ name: "light", default: true, rules: {} },
			{ name: "dark", default: true, rules: {} },
		],
		new Set(),
	);
	assertEquals(diagnostics.filter((d) => d.message.includes("marked default")).length, 1);
});

Deno.test("missing required tokens are reported by name", () => {
	const diagnostics = validateVariants([{ name: "light", rules: {} }], new Set());
	const missing = diagnostics.filter((d) => d.message.includes("required token"));
	assertEquals(missing.length, 1);
	assertStringIncludes(missing[0].message, "btnSuccessFg");
});
