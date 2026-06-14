export * from "./generate.ts";
export * from "./types.ts";
export * from "./inject.ts";

import type { Theme } from "./types.ts";

export async function getDefaultTheme(): Promise<Theme> {
	const url = new URL(`./themes/bearmetal.theme.json`, import.meta.url);
	const res = await fetch(url);
	return await res.json() as Theme;
}
