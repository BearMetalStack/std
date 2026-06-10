import { cssFromJson } from "./generate.ts";
import { getRegisteredTheme } from "./inject.ts";
import type { Theme } from "./types.ts";

async function loadTheme(name: string): Promise<Theme> {
	const url = new URL(`./themes/${name}.theme.json`, import.meta.url);
	const res = await fetch(url);
	return await res.json() as Theme;
}

export async function ThemeStyle({ theme }: { theme?: string }) {
	const data = theme
		? (getRegisteredTheme(theme) ?? await loadTheme(theme))
		: await loadTheme("bearmetal");
	return <style raw>{cssFromJson(data)}</style>;
}
