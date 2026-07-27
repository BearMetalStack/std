import { dotBearmetalFile } from "../miscellanea/fs/dotBearmetal.ts";
import { storeStylesheets } from "./css/compliantCSS.ts";
import { themeCSS } from "./css/generate.ts";
import { namespaces } from "./namespaces.ts";
import { loadTheme } from "./theme.ts";

async function build() {
	const names = Deno.args.filter((a) => !a.startsWith("-"));
	if (names.length === 0) names.push("bearmetal");
	for (const name of names) {
		const theme = await loadTheme(name);
		const stylesheet = themeCSS(theme, ":root");
		const file = await dotBearmetalFile(namespaces.stylesheets, `${name}.css`);
		file.write(stylesheet);
	}
}

if (import.meta.main) {
	build();
	storeStylesheets();
}
