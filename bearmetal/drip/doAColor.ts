import { cliConfirm, cliPrompt, selectMenuInteractive } from "@bearmetal/cli";
import { bgColorize, colorize } from "@bearmetal/cli/style";
import type { Theme } from "@bearmetal/drip";
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

export async function doAColor(theme: Theme) {
	console.log("Coat of paint coming right up!");
	let colorName = await cliPrompt("What would you like to name this color?");
	colorName = toKebabCase(colorName);
	console.log(`Color name: ${colorName}`);
	let color = await cliPrompt("What color would you like to use as the seed?");
	while (!isValidHex(color)) {
		color = await cliPrompt("Invalid color. Please enter a valid hex color (e.g. #ff0000):");
	}
	color = color.replace("#", "");
	if (color.length < 6) color = color.split("").map((c) => c + c).join("");
	color = "#" + color;
	console.log(`Color: ${bgColorize("  ", color)}`);
	const oklch = srgbToOklch(hexToSrgb(color));
	const recommendedStop = STOPS.toSorted((a, b) => {
		const diffA = Math.abs(DEFAULT_LIGHTNESS_MAP[a] - oklch.l),
			diffB = Math.abs(DEFAULT_LIGHTNESS_MAP[b] - oklch.l);
		return diffA - diffB;
	})[0];
	let done = false;
	let steps: ReturnType<typeof seededScale>;
	let identityStop: number;
	while (!done) {
		const stop = await selectMenuInteractive(
			`What stop would you like to use? (recommended: ${colorize(String(recommendedStop), color)})`,
			STOPS.map(String),
			{ initialSelection: STOPS.indexOf(recommendedStop) },
		) ||
			String(recommendedStop);
		identityStop = parseInt(stop);
		const lightnessMap = generateRelativeLightnessMap(oklch.l, identityStop);
		steps = seededScale(color, identityStop, lightnessMap);
		if (STOPS.some((e) => steps[e].clamped)) {
			console.log("Colors were clamped, check the output to make sure it looks as you expect.");
		}
		console.log(
			STOPS.map((e) => {
				const s = String(e);
				if (s === stop) return colorize(s.padEnd(4).padStart(5), "green");
				return s.padEnd(4).padStart(5);
			}).join(""),
		);
		for (let i = 0; i < 2; i++) {
			console.log(
				STOPS.map((s) => {
					const step = steps[s];
					return bgColorize("     ", step.hex);
				}).join(""),
			);
		}
		done = await cliConfirm("Look good?", true);
	}
	if (!steps!) throw new Error("No steps generated... how did you do that?");
	let current = (theme.color ??= {}) as Theme;
	current = colorName.split("-").reduce(
		(acc, part) => ((acc as Theme)[part] ??= {}) as Theme,
		current,
	);
	for (const stop of STOPS) {
		current[stop] = steps[stop].hex;
	}

	while (current[""] && typeof current[""] !== "string") current = current[""] as Theme;

	current[""] = steps[identityStop!].hex;
}

export function generateSteps(theme: Theme, color: { name: string; hex: string; stop: number }) {
	const oklch = srgbToOklch(hexToSrgb(color.hex));
	const lightnessMap = generateRelativeLightnessMap(oklch.l, color.stop);
	const steps = seededScale(color.hex, color.stop, lightnessMap);
	let current = theme.color as Theme;
	current = color.name.split("-").reduce(
		(acc, part) => ((acc as Theme)[part] ??= {}) as Theme,
		current,
	);
	for (const stop of STOPS) {
		current[stop] = steps[stop].hex;
	}

	while (current[""] && typeof current[""] !== "string") current = current[""] as Theme;

	current[""] = steps[color.stop!].hex;
}
