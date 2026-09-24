import { bgColorize, cliPrompt, selectMenuInteractive } from "@bearmetal/cli";
import { Chain, toSentenceCase, toSnakeCase } from "@bearmetal/miscellanea";
import { colorize } from "@bearmetal/cli/style";
import {
	DEFAULT_NEUTRAL_SEED,
	REQUIRED_BASE_RAMPS,
	SEMANTIC_ROLES,
	type Theme,
	ThemeUtils,
	validateRamps,
} from "@bearmetal/drip";
import { dotBearmetalFile } from "@bearmetal/miscellanea/fs";
import { namespaces } from "@bearmetal/drip/namespaces";
import {
	doAColor,
	generateSteps,
	pickSemanticHue,
	promptRequiredRamp,
	writeAliasRamp,
} from "./doAColor.ts";
import { promptAdditionalVariants, promptDefaultVariant } from "./doAVariant.ts";
import type { Resolved } from "../run.ts";

export async function generateDripTheme(
	resolved: Resolved & { command: "drip" },
) {
	if (isNonInteractive(resolved)) return generateNonInteractively(resolved);
	console.log("Let's build a theme!");
	let themeName = await cliPrompt(
		"What should we call your theme? (Keep this name short and sweet)",
	);
	themeName = toSnakeCase(themeName);
	console.log(`Theme name: ${colorize(themeName, "green")}`);
	const theme: Theme = {};

	console.log(
		`\nFirst, the required ramps every theme needs: ${
			REQUIRED_BASE_RAMPS.map((r) => colorize(r, "green")).join(", ")
		}.`,
	);
	for (const ramp of REQUIRED_BASE_RAMPS) {
		await promptRequiredRamp(
			theme,
			ramp,
			ramp === "neutral" ? { defaultHex: DEFAULT_NEUTRAL_SEED } : {},
		);
	}

	console.log("\nAny other colors your theme needs? Add as many as you like.");
	const q = "What would you like to do next?";
	const a = [["Add a color", "color"], ["Continue", "gen"]] as [string, string][];
	for (
		let answer = await selectMenuInteractive(q, a);
		answer !== "gen";
		answer = await selectMenuInteractive(q, a)
	) {
		switch (answer) {
			case "color":
				await doAColor(theme);
				break;
		}
	}

	console.log(
		`\nNow the semantic colors — ${
			SEMANTIC_ROLES.map((r) => colorize(r, "green")).join(", ")
		}. Each one is backed by one of the required ramps above.`,
	);
	for (const role of SEMANTIC_ROLES) {
		const hue = await pickSemanticHue(role);
		writeAliasRamp(theme, role, hue);
	}

	console.log("\nAlrighty, lets look at your theme real quick.");
	const themeUtil = new ThemeUtils(theme);
	console.log("Colors:");
	const colors = (await Chain.fromAsync(themeUtil.eachColor({ skipReferences: true }))).groupBy((
		[k],
		groups,
	) =>
		groups[k.split("-").slice(1).join("-")]
			? k.split("-").slice(1).join("-")
			: k.split("-").slice(1, -1).join("-")
	);
	for (const colorGroup of colors.groups) {
		console.log("  " + colorGroup.__group + ":");
		for (const color of colorGroup) {
			let colorName = color[0].split("-").at(-1)?.padEnd(3);
			if (color[0].endsWith(colorGroup.__group!)) colorName = "__$";
			console.log(
				`    ${colorName}: ${color[1]} ${bgColorize("  ", color[1])}`,
			);
		}
	}
	for (const namespace of Object.keys(theme)) {
		if (namespace === "color") continue;
		console.log(`\n${colorize(toSentenceCase(namespace), "green")}:`);
		for await (const [key, value] of themeUtil._each(theme, [namespace])) {
			console.log(`${key}: ${value}`);
		}
	}

	const defaultVariant = await promptDefaultVariant(theme);
	const additionalVariants = await promptAdditionalVariants(theme, defaultVariant);
	theme.variants = [defaultVariant, ...additionalVariants];

	await cliPrompt("Press enter to generate the theme file.");
	const themeFile = await dotBearmetalFile(namespaces.themes, themeName + ".theme.json");
	await themeFile.writeJson(theme);
	console.log(`Theme file generated: ${themeFile.path}`);
}

function isNonInteractive(resolved: { command: "drip" } & Resolved): boolean {
	return Boolean(resolved.color.length && resolved.name);
}

async function generateNonInteractively(resolved: { command: "drip" } & Resolved) {
	const themeName = resolved.name;
	const themeFile = await dotBearmetalFile(namespaces.themes, themeName + ".theme.json");
	const theme = await themeFile.readJson();
	for (const color of resolved.color) {
		generateSteps(theme, color);
	}
	await themeFile.writeJson(theme);

	const missing = validateRamps(theme);
	if (missing.length) {
		console.log(
			colorize(
				`\nHeads up: this theme is still missing ${missing.length} required ramp${
					missing.length === 1 ? "" : "s"
				} (${
					missing.map((m) => m.ramp).join(", ")
				}). Components that assume them will lose their color until you add --color entries for each.`,
				"yellow",
			),
		);
	}
}
