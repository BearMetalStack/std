import { Style, TrustedModule } from "@bearmetal/router";
import type { Theme } from "./types.ts";
import { getDefaultTheme, loadTheme } from "@bearmetal/drip";
import { themeCSS } from "./css/generate.ts";
import compliantCSS, { type CompliantID } from "./css/compliantCSS.ts";

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
		this.route("/@bearmetal/style/:compliantId").get((ctx) => {
			const id = ctx.params.compliantId as CompliantID;
			const stylesheet = compliantCSS(id);

			return Style(stylesheet);
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
