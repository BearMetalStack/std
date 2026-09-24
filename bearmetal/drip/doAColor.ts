import { cliConfirm, cliPrompt, selectMenuInteractive } from "@bearmetal/cli";
import { bgColorize, colorize } from "@bearmetal/cli/style";
import {
	type HueRampName,
	REQUIRED_HUE_RAMPS,
	type SemanticRole,
	type Theme,
	TYPICAL_SEMANTIC_HUE,
} from "@bearmetal/drip";
import {
	DEFAULT_LIGHTNESS_MAP,
	generateRelativeLightnessMap,
	hexToSrgb,
	isValidHex,
	seededScale,
	srgbToOklch,
	STOPS,
	toKebabCase,
} from "@bearmetal/miscellanea";

type Scale = ReturnType<typeof seededScale>;

/** Prompts for a hex color, looping until the input is valid. */
export async function promptHex(question: string, defaultHex?: string): Promise<string> {
	let color = await cliPrompt(question, defaultHex);
	while (!isValidHex(color)) {
		color = await cliPrompt(
			"Invalid color. Please enter a valid hex color (e.g. #ff0000):",
			defaultHex,
		);
	}
	color = color.replace("#", "");
	if (color.length < 6) color = color.split("").map((c) => c + c).join("");
	return "#" + color;
}

/** The stop whose default lightness sits closest to `hex`'s own. */
function recommendedStop(hex: string): number {
	const oklch = srgbToOklch(hexToSrgb(hex));
	return STOPS.toSorted((a, b) => {
		const diffA = Math.abs(DEFAULT_LIGHTNESS_MAP[a] - oklch.l),
			diffB = Math.abs(DEFAULT_LIGHTNESS_MAP[b] - oklch.l);
		return diffA - diffB;
	})[0];
}

function printScalePreview(steps: Scale, highlightStop: string) {
	console.log(
		STOPS.map((e) => {
			const s = String(e);
			if (s === highlightStop) return colorize(s.padEnd(4).padStart(5), "green");
			return s.padEnd(4).padStart(5);
		}).join(""),
	);
	for (let i = 0; i < 2; i++) {
		console.log(STOPS.map((s) => bgColorize("     ", steps[s].hex)).join(""));
	}
}

/**
 * Lets the author pick which stop `hex` should occupy, previewing the
 * resulting scale and letting them retry the stop until they're happy with
 * it. Shared by the required-ramp flow and the freeform one so both scales
 * are built the same way.
 */
export async function pickStopAndPreview(
	label: string,
	hex: string,
): Promise<{ steps: Scale; identityStop: number }> {
	const seedLightness = srgbToOklch(hexToSrgb(hex)).l;
	const recommended = recommendedStop(hex);
	let done = false;
	let steps!: Scale;
	let identityStop!: number;
	while (!done) {
		const stop = await selectMenuInteractive(
			`What stop would you like "${label}" to use? (recommended: ${
				colorize(String(recommended), hex)
			})`,
			STOPS.map(String),
			{ initialSelection: STOPS.indexOf(recommended) },
		) || String(recommended);
		identityStop = parseInt(stop);
		const lightnessMap = generateRelativeLightnessMap(seedLightness, identityStop);
		steps = seededScale(hex, identityStop, lightnessMap);
		if (STOPS.some((e) => steps[e].clamped)) {
			console.log("Colors were clamped, check the output to make sure it looks as you expect.");
		}
		printScalePreview(steps, stop);
		done = await cliConfirm("Look good?", true);
	}
	return { steps, identityStop };
}

/**
 * Writes a generated scale into `theme.color.<name>`, nesting on `.` the same
 * way the accessor syntax does. Legacy themes nested the seed under repeated
 * empty keys; walk down to the ramp that actually holds the stops before
 * writing.
 */
function writeRampStops(theme: Theme, name: string, steps: Scale, identityStop: number) {
	let current = (theme.color ??= {}) as Theme;
	current = name.split(".").reduce(
		(acc, part) => ((acc as Theme)[part] ??= {}) as Theme,
		current,
	);
	for (const stop of STOPS) {
		current[stop] = steps[stop].hex;
	}

	while (current[""] && typeof current[""] !== "string") current = current[""] as Theme;

	delete current[""];
	current.base = steps[identityStop].hex;
}

/**
 * Writes a ramp (typically a semantic one — `success`, `danger`, ...) as a
 * full alias into a required hue ramp: every stop, plus the identity, is a
 * `$color.<hue>` accessor rather than an independent scale. `$color.<hue>`
 * (not `$color.<hue>.base`) is deliberate — a ramp's identity is emitted at
 * its bare property (`--color-<hue>`), and `.base` isn't a stop the
 * flattener special-cases in an accessor value the way it does for a ramp's
 * own `base` key.
 */
export function writeAliasRamp(theme: Theme, name: string, hue: HueRampName) {
	const alias: Record<string, string> = { base: `$color.${hue}` };
	for (const stop of STOPS) alias[stop] = `$color.${hue}.${stop}`;
	const color = (theme.color ??= {}) as Theme;
	color[name] = alias as unknown as Theme;
}

/** Lets the author choose the hue that backs a semantic role, defaulting to the typical mapping. */
export async function pickSemanticHue(role: SemanticRole): Promise<HueRampName> {
	const typical = TYPICAL_SEMANTIC_HUE[role];
	const chosen = await selectMenuInteractive(
		`Which color should represent "${role}"? (typical: ${colorize(typical, typical)})`,
		[...REQUIRED_HUE_RAMPS],
		{ initialSelection: REQUIRED_HUE_RAMPS.indexOf(typical) },
	);
	return (chosen ?? typical) as HueRampName;
}

/** The freeform "add a color" flow: prompts for a name, then delegates to the shared hex/stop flow. */
export async function doAColor(theme: Theme) {
	console.log("Coat of paint coming right up!");
	let colorName = await cliPrompt("What would you like to name this color?");
	colorName = toKebabCase(colorName);
	console.log(`Color name: ${colorName}`);
	const hex = await promptHex("What color would you like to use as the seed?");
	console.log(`Color: ${bgColorize("  ", hex)}`);
	const { steps, identityStop } = await pickStopAndPreview(colorName, hex);
	writeRampStops(theme, colorName, steps, identityStop);
}

/**
 * Prompts for one of the required base ramps (`brand`, `accent`, `neutral`,
 * or a required hue). `defaultHex`, when given, is offered as the value
 * pressing enter accepts — used for `neutral`, where a plain gray is always a
 * reasonable starting point.
 */
export async function promptRequiredRamp(
	theme: Theme,
	name: string,
	opts: { defaultHex?: string } = {},
) {
	console.log(`\nLet's set up your ${colorize(name, "green")} ramp.`);
	const hex = await promptHex(`What color should "${name}" be?`, opts.defaultHex);
	console.log(`Color: ${bgColorize("  ", hex)}`);
	const { steps, identityStop } = await pickStopAndPreview(name, hex);
	writeRampStops(theme, name, steps, identityStop);
}

/**
 * Nests the ramp under `theme.color` at the path its name describes. `.` is the
 * nesting separator, so `bearmetal.grey` becomes `color.bearmetal.grey` while
 * `primary-ink` stays one flat ramp — a hyphen is part of the name, never
 * structure, so the accessor an author writes always matches the name they
 * passed in.
 */
export function generateSteps(
	theme: Theme,
	color: { name: string; hex: string; stop: number },
	uniformStep = false,
) {
	const oklch = srgbToOklch(hexToSrgb(color.hex));
	const lightnessMap = generateRelativeLightnessMap(oklch.l, color.stop, { uniformStep });
	const steps = seededScale(color.hex, color.stop, lightnessMap);
	writeRampStops(theme, color.name, steps, color.stop);
}
