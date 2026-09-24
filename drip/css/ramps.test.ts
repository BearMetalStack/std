import { assert, assertEquals } from "@std/assert";
import {
	isHueRampName,
	REQUIRED_BASE_RAMPS,
	REQUIRED_HUE_RAMPS,
	REQUIRED_RAMPS,
	TYPICAL_SEMANTIC_HUE,
	validateRamps,
} from "./ramps.ts";
import { SEMANTIC_ROLES } from "./tokens.ts";
import type { Theme } from "../types.ts";

function stopRamp(): Record<string, string> {
	return {
		"50": "#fff",
		"100": "#eee",
		"500": "#888",
		"950": "#000",
		base: "#888",
	};
}

function completeTheme(): Theme {
	const color: Record<string, unknown> = {};
	for (const ramp of REQUIRED_BASE_RAMPS) color[ramp] = stopRamp();
	for (const role of SEMANTIC_ROLES) color[role] = stopRamp();
	return { color } as unknown as Theme;
}

Deno.test("every typical semantic hue is one of the required hue ramps", () => {
	for (const role of SEMANTIC_ROLES) {
		assert(
			(REQUIRED_HUE_RAMPS as readonly string[]).includes(TYPICAL_SEMANTIC_HUE[role]),
			`${role} maps to ${TYPICAL_SEMANTIC_HUE[role]}, which is not a required hue`,
		);
	}
});

Deno.test("required ramps are the base ramps plus the semantic roles", () => {
	assertEquals(REQUIRED_RAMPS.length, REQUIRED_BASE_RAMPS.length + SEMANTIC_ROLES.length);
	for (const ramp of REQUIRED_BASE_RAMPS) assert(REQUIRED_RAMPS.includes(ramp));
	for (const role of SEMANTIC_ROLES) assert(REQUIRED_RAMPS.includes(role));
});

Deno.test("a complete theme has no ramp diagnostics", () => {
	assertEquals(validateRamps(completeTheme()), []);
});

Deno.test("a theme with no color tree is missing every required ramp", () => {
	const diagnostics = validateRamps({});
	assertEquals(diagnostics.length, REQUIRED_RAMPS.length);
	assert(diagnostics.every((d) => d.problem === "missing"));
});

Deno.test("a ramp with no numeric stops is flagged, not treated as missing", () => {
	const theme = completeTheme();
	(theme.color as Theme).brand = { text: "#fff" } as unknown as Theme;
	const diagnostics = validateRamps(theme);
	assertEquals(diagnostics, [{ ramp: "brand", problem: "not-a-ramp" }]);
});

Deno.test("a theme missing just the semantic ramps is flagged for those only", () => {
	const theme = completeTheme();
	delete (theme.color as Theme).danger;
	const diagnostics = validateRamps(theme);
	assertEquals(diagnostics, [{ ramp: "danger", problem: "missing" }]);
});

Deno.test("isHueRampName recognizes the eight required hues and nothing else", () => {
	for (const hue of REQUIRED_HUE_RAMPS) assert(isHueRampName(hue));
	assert(!isHueRampName("brand"));
	assert(!isHueRampName("success"));
	assert(!isHueRampName("chartreuse"));
});
