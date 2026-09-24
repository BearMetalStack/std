import { assertEquals } from "@std/assert";
import { withDefaultTokens } from "../theme.ts";
import { definedProperties } from "./generate.ts";
import { findVarReferences } from "./validate.ts";
import { COMPLIANT_SOURCES } from "./embed.ts";

/** Custom properties a stylesheet declares for itself, e.g. `--btn-hover-color: …`. */
function locallyDeclared(css: string): Set<string> {
	return new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

const theme = await withDefaultTokens(
	JSON.parse(await Deno.readTextFile(new URL("../themes/bearmetal.theme.json", import.meta.url))),
);
const defined = definedProperties(theme);

for (const file of Object.values(COMPLIANT_SOURCES)) {
	Deno.test(`${file} references only properties the theme or the sheet defines`, async () => {
		const css = await Deno.readTextFile(new URL(`./${file}`, import.meta.url));
		const local = locallyDeclared(css);
		// `var(--x, fallback)` is an optional hook a theme may leave undefined.
		const hooks = new Set([...css.matchAll(/var\(\s*(--[\w-]+)\s*,/g)].map((m) => m[1]));
		const dangling = [...new Set(findVarReferences(css))]
			.filter((p) => !defined.has(p) && !local.has(p) && !hooks.has(p));
		assertEquals(dangling, []);
	});
}
