import { NotFound, Style, TrustedModule } from "@bearmetal/router";
import type { Theme } from "./types.ts";
import { getDefaultTheme, loadTheme } from "@bearmetal/drip";
import { themeCSS } from "./css/generate.ts";
import type { CompliantID } from "./css/compliantCSS.ts";
import { loadStylesheet } from "./theme.ts";
import { fontFaceCSS, themeFontFaceCSS } from "./fonts/mod.ts";

class DripModule extends TrustedModule {
	#themes: Promise<Theme[]> = Promise.resolve([]);
	#stylesheet: string | null = null;
	constructor(...includedThemes: string[]) {
		super("@bearmetal/drip");
		this.init(...includedThemes);
	}

	init(...includedThemes: string[]) {
		this.loadThemes(...includedThemes);
		this.route("/@bearmetal/style").get(async () => {
			this.#stylesheet ??= await this.constructStylesheet() || null;

			return Style(this.#stylesheet ?? "");
		});
		this.route("/@bearmetal/style/:compliantId").get(async (ctx) => {
			const id = ctx.params.compliantId as CompliantID;
			const stylesheet = await loadStylesheet(id);

			if (!stylesheet) return NotFound(`Stylesheet ${id} not found`);

			return Style(stylesheet);
		});
		this.route("/@bearmetal/fonts").get(async () => {
			const [theme] = await this.#themes;
			return Style(theme ? themeFontFaceCSS(theme) : "");
		});
		this.route("/@bearmetal/fonts/:name").get((ctx) => {
			const name = ctx.params.name ?? "";
			const sheet = fontFaceCSS([name]);
			return sheet ? Style(sheet) : NotFound(`Drip does not self-host a font named "${name}"`);
		});
	}

	loadThemes(...includedThemes: string[]) {
		if (includedThemes.length === 0) this.#themes = Promise.all([getDefaultTheme()]);
		else this.#themes = Promise.all(includedThemes.map((t) => loadTheme(t)));
	}

	async constructStylesheet(): Promise<string> {
		const themes = await this.#themes;
		return themes.map((t) => themeCSS(t, ":root")).join("\n\n");
	}
}

export function dripModule(...includedThemes: string[]): TrustedModule {
	const mod = new DripModule(...includedThemes);
	return mod;
}
