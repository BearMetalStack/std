export * from "./generate.ts";
export * from "./types.ts";
export * from "./inject.ts";

import type { Theme } from "./types.ts";
import { cssFromJson } from "./generate.ts";

export async function getDefaultTheme(): Promise<Theme> {
	const url = new URL(`./themes/bearmetal.theme.json`, import.meta.url);
	const res = await fetch(url);
	return await res.json() as Theme;
}

if (import.meta.main) {
	const theme = Deno.args.find((e) => e.startsWith("--theme"))?.split("=")[1] ?? "bearmetal";
	const url = new URL(`./themes/${theme}.theme.json`, import.meta.url);
	const res = await fetch(url);
	const json = await res.json() as Theme;
	const css = cssFromJson(json);
	Deno.writeTextFile(".bearmetal/themes/base.css", css, { create: true });
}
