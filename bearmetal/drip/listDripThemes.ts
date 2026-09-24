import { colorize } from "@bearmetal/cli/style";
import { listBuiltinThemes, listCustomThemeNames, readDripConfig } from "@bearmetal/drip";

export async function listDripThemes() {
	const dripConfig = await readDripConfig();
	const defaultTheme = dripConfig.defaultTheme ?? "bearmetal";
	const themes = [
		...new Set([
			...await listCustomThemeNames(),
			...listBuiltinThemes().filter((name) => name !== "bearmetal" || !dripConfig.disableBearmetal),
		]),
	];
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
