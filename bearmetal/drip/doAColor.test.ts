import { assert, assertEquals } from "@std/assert";
import { REQUIRED_HUE_RAMPS, type Theme, TYPICAL_SEMANTIC_HUE } from "@bearmetal/drip";
import { STOPS } from "@bearmetal/miscellanea";
import { generateSteps, writeAliasRamp } from "./doAColor.ts";

Deno.test("writeAliasRamp aliases every stop into the target hue, not an independent scale", () => {
	const theme: Theme = {};
	writeAliasRamp(theme, "danger", "red");
	const danger = (theme.color as Theme).danger as unknown as Record<string, string>;
	for (const stop of STOPS) {
		assertEquals(danger[stop], `$color.red.${stop}`);
	}
});

Deno.test("writeAliasRamp's base points at the hue's bare identity, not a `.base` accessor", () => {
	// `$color.red.base` would resolve to a property nothing emits (`--color-red-base`);
	// the ramp's identity is emitted at the bare `--color-red` property instead.
	const theme: Theme = {};
	writeAliasRamp(theme, "danger", "red");
	const danger = (theme.color as Theme).danger as unknown as Record<string, string>;
	assertEquals(danger.base, "$color.red");
});

Deno.test("writeAliasRamp overwrites whatever ramp previously lived at that name", () => {
	const theme: Theme = { color: { danger: { "500": "#independent-scale" } } as unknown as Theme };
	writeAliasRamp(theme, "danger", "green");
	const danger = (theme.color as Theme).danger as unknown as Record<string, string>;
	assertEquals(danger["500"], "$color.green.500");
});

Deno.test("generateSteps writes every stop plus a base identity", () => {
	const theme: Theme = {};
	generateSteps(theme, { name: "brand", hex: "#4a0080", stop: 500 });
	const brand = (theme.color as Theme).brand as unknown as Record<string, string>;
	for (const stop of STOPS) {
		assert(typeof brand[stop] === "string" && brand[stop].startsWith("#"), `missing stop ${stop}`);
	}
	assertEquals(brand.base, brand["500"]);
});

Deno.test("generateSteps nests dotted names under theme.color", () => {
	const theme: Theme = {};
	generateSteps(theme, { name: "brand.grey", hex: "#808080", stop: 500 });
	const nested = ((theme.color as Theme).brand as unknown as Record<string, unknown>)
		.grey as Record<
			string,
			string
		>;
	assertEquals(nested.base, nested["500"]);
});

Deno.test("every typical semantic hue is one of the required hue ramps", () => {
	for (const hue of Object.values(TYPICAL_SEMANTIC_HUE)) {
		assert((REQUIRED_HUE_RAMPS as readonly string[]).includes(hue));
	}
});
