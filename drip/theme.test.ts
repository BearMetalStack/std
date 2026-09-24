import { assertEquals } from "@std/assert";
import { BUILTIN_THEMES, withDefaultTokens } from "./theme.ts";
import { diagnoseTheme } from "./css/generate.ts";
import { getThemeVariants } from "./css/variants.ts";
import { VARIANT_TOKENS } from "./css/tokens.ts";
import type { Theme } from "./types.ts";

async function readBuiltin(name: string): Promise<Theme> {
	const url = new URL(`./themes/${name}.theme.json`, import.meta.url);
	return JSON.parse(await Deno.readTextFile(url));
}

for (const name of BUILTIN_THEMES) {
	Deno.test(`bundled theme "${name}" generates without a single diagnostic`, async () => {
		const theme = await withDefaultTokens(await readBuiltin(name));
		assertEquals(diagnoseTheme(theme).map((d) => `${d.where}: ${d.message}`), []);
	});

	Deno.test(`bundled theme "${name}" states every token in every variant`, async () => {
		// Non-default variants are completed against the manifest at generate time,
		// so a token one leaves out is derived inside that variant rather than
		// inherited from the default. Bundled themes spell everything out.
		for (const variant of getThemeVariants(await readBuiltin(name))) {
			const missing = VARIANT_TOKENS.filter((t) => !variant.rules[t.property]).map((t) => t.key);
			assertEquals(missing, [], `variant "${variant.name}"`);
		}
	});
}
