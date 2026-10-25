// Rebuilds assets/icons.svg with only the symbols ICONS names, out of webbies' full Phosphor sheet.
import { ICONS } from "../icons.ts";

const source = await Deno.readTextFile(
	new URL("../../webbies/icons/phosphor/base.svg", import.meta.url),
);

const symbols = new Map<string, string>();
for (const m of source.matchAll(/<symbol\b[^>]*\sid="([^"]+)"[\s\S]*?<\/symbol>/g)) {
	symbols.set(m[1], m[0]);
}

const missing = ICONS.filter((name) => !symbols.has(name));
if (missing.length) {
	console.error(`Not in the Phosphor sheet: ${missing.join(", ")}`);
	Deno.exit(1);
}

const sheet = `<svg xmlns="http://www.w3.org/2000/svg">\n${
	ICONS.map((name) => symbols.get(name)).join("\n")
}\n</svg>\n`;
await Deno.writeTextFile(new URL("../assets/icons.svg", import.meta.url), sheet);
console.log(`Wrote ${ICONS.length} icons to assets/icons.svg`);
