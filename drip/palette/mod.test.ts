import { assert, assertStringIncludes } from "@std/assert";
import { router } from "./mod.tsx";
import { BUILTIN_THEMES, loadRawTheme } from "../theme.ts";
import { getThemeVariants } from "../css/variants.ts";

async function page(theme: string): Promise<string> {
	const res = await router.handle(
		new Request(`http://palette.test/?theme=${theme}`),
		{} as Deno.ServeHandlerInfo<Deno.NetAddr>,
	);
	assert(res.ok, `palette answered ${res.status} for ${theme}`);
	return await res.text();
}

for (const name of BUILTIN_THEMES) {
	Deno.test(`palette ships the "${name}" theme sheet, fonts, and every variant`, async () => {
		const html = await page(name);
		assertStringIncludes(html, "--color-bg:");
		assertStringIncludes(html, "@font-face");
		// Previews are nested [data-theme] elements, so their component tokens
		// only follow the card's variant if derived tokens are re-declared there.
		assertStringIncludes(html, "[data-theme] {");
		for (const variant of getThemeVariants(await loadRawTheme(name))) {
			assertStringIncludes(html, `[data-theme="${variant.name}"]`);
		}
	});
}
