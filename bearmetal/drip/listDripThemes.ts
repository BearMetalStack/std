import { colorize } from "@bearmetal/cli/style";
import { getDripConfig, listCustomThemeNames } from "@bearmetal/drip";

export async function listDripThemes() {
	const dripConfig = await (await getDripConfig()).readJson();
	const defaultTheme = dripConfig.defaultTheme ?? "bearmetal";
	const themes = await listCustomThemeNames();
	if (!dripConfig.disableBearmetal) themes.push("bearmetal");
	console.log(
		themes.sort((a, b) => {
			if (a === defaultTheme) return -1;
			if (b === defaultTheme) return 1;
			return a.localeCompare(b);
		}).map((e) => {
			if (e === defaultTheme) return `${e} - ${colorize("default •", "porple")}`;
			return e;
		}).join("\n"),
	);
}
