export * from "./css/generate.ts";
export * from "./types.ts";
export * from "./inject.ts";
export * from "./config.ts";
export * from "./theme.ts";
export * from "./palette/ThemeUtils.ts";
export * from "./css/compliantCSS.ts";
export * from "./module.ts";

import { generateStylesheets } from "./theme.ts";

if (import.meta.main) {
	const written = await generateStylesheets();
	console.log(
		`Drip: generated ${written.length} stylesheet${written.length === 1 ? "" : "s"}${
			written.length ? ` (${written.join(", ")})` : ""
		}`,
	);
}
