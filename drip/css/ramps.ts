/**
 * The canonical set of Drip color ramps.
 *
 * Everything downstream — variant tokens, component styles — assumes these
 * ramps exist under `theme.color` with the full {@linkcode STOPS} scale. A
 * theme that skips one isn't just incomplete, it silently drops whatever
 * referenced it: a `var()` naming a property nothing defines is invalid at
 * computed-value time, so the declaration is dropped rather than erroring.
 *
 * A *semantic ramp* (`success`, `danger`, `warning`, `info`) is never an
 * independent scale — it is always a full alias into one of the required hue
 * ramps, so swapping which hue backs "danger" is a one-line change and every
 * theme's semantic colors stay visually distinct from its brand color by
 * construction.
 *
 * @module
 */

import { SEMANTIC_ROLES, type SemanticRole } from "./tokens.ts";
import type { Theme } from "../types.ts";

/** The eight hues every theme must seed. */
export const REQUIRED_HUE_RAMPS = [
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"magenta",
	"cyan",
	"pink",
] as const;

/** A required hue ramp name. */
export type HueRampName = typeof REQUIRED_HUE_RAMPS[number];

/**
 * Every ramp a theme must define before it's considered complete: the two
 * brand-carrying ramps, a neutral, and the eight hues.
 */
export const REQUIRED_BASE_RAMPS = ["brand", "accent", "neutral", ...REQUIRED_HUE_RAMPS] as const;

/** A required base ramp name. */
export type RequiredBaseRamp = typeof REQUIRED_BASE_RAMPS[number];

/**
 * The hue a semantic role reads as by convention. Presented as the
 * pre-selected choice when a theme author assigns a color to a semantic role
 * — accepting it is "use the typical color"; picking another hue is "use the
 * color name."
 */
export const TYPICAL_SEMANTIC_HUE: Record<SemanticRole, HueRampName> = {
	success: "green",
	danger: "red",
	warning: "orange",
	info: "blue",
};

/** A reasonable default seed for the `neutral` ramp — a plain mid gray. */
export const DEFAULT_NEUTRAL_SEED = "#71717a";

/**
 * Every ramp `validateRamps` requires: the base ramps plus the semantic
 * roles, which are ramps in their own right (aliasing a hue) rather than a
 * derived variant token.
 */
export const REQUIRED_RAMPS: readonly string[] = Object.freeze([
	...REQUIRED_BASE_RAMPS,
	...SEMANTIC_ROLES,
]);

/** Whether a theme node is a color ramp — has at least one numeric stop key. */
function isStopRamp(node: unknown): boolean {
	if (!node || typeof node !== "object" || Array.isArray(node)) return false;
	return Object.keys(node as Record<string, unknown>).some((k) => k !== "" && !isNaN(Number(k)));
}

/** A missing or malformed required ramp, for {@linkcode validateRamps}. */
export interface RampDiagnostic {
	ramp: string;
	problem: "missing" | "not-a-ramp";
}

/**
 * Checks that every required base ramp and semantic ramp exists under
 * `theme.color` and is shaped like a color scale (has numeric stop keys).
 * Doesn't check stop completeness (50-950) — a ramp mid-generation with a
 * handful of stops still counts as present.
 */
export function validateRamps(theme: Theme): RampDiagnostic[] {
	const color = theme.color as Theme | undefined;
	const diagnostics: RampDiagnostic[] = [];
	for (const ramp of REQUIRED_RAMPS) {
		const node = color?.[ramp];
		if (node === undefined) {
			diagnostics.push({ ramp, problem: "missing" });
		} else if (!isStopRamp(node)) {
			diagnostics.push({ ramp, problem: "not-a-ramp" });
		}
	}
	return diagnostics;
}

/** `true` for any of the eight required hue names. */
export function isHueRampName(name: string): name is HueRampName {
	return (REQUIRED_HUE_RAMPS as readonly string[]).includes(name);
}
