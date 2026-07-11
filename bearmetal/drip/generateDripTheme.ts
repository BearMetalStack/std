import { bgColorize, cliPrompt, selectMenuInteractive } from "@bearmetal/cli";
import { Chain, toSentenceCase, toSnakeCase } from "@bearmetal/miscellanea";
import { colorize } from "@bearmetal/cli/style";
import { type Theme, ThemeUtils } from "@bearmetal/drip";
import { dotBearmetalFile } from "@bearmetal/miscellanea/fs";
import { namespaces } from "@bearmetal/drip/namespaces";
import { doAColor } from "./doAColor.ts";

export async function generateDripTheme() {
	console.log("Let's build a theme!");
	let themeName = await cliPrompt(
		"What should we call your theme? (Keep this name short and sweet)",
	);
	themeName = toSnakeCase(themeName);
	console.log(`Theme name: ${colorize(themeName, "green")}`);
	const theme: Theme = {};
	const q = "What would you like to do next?";
	const a = [["Add a color", "color"], ["Generate the theme file", "gen"]] as [string, string][];
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
	console.log("Alrighty, lets look at your theme real quick.");
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
	await cliPrompt("Press enter to generate the theme file.");
	const themeFile = await dotBearmetalFile(namespaces.themes, themeName + ".theme.json");
	await themeFile.writeJson(theme);
	console.log(`Theme file generated: ${themeFile.path}`);
}
