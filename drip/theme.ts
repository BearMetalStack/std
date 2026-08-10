import {
	dotBearmetalDirUrl,
	dotBearmetalFile,
	dotBearmetalFileUrl,
} from "@bearmetal/miscellanea/fs";
import { namespaces } from "./namespaces.ts";
import { readDripConfig } from "./config.ts";
import { getRegisteredTheme } from "./inject.ts";
import { cssFromJson } from "./css/generate.ts";
import { deepMerge } from "@bearmetal/miscellanea";
import type { Theme } from "./types.ts";

const THEME_SUFFIX = ".theme.json";
const DEFAULTS_THEME = "_defaults";

let defaultsPromise: Promise<Theme> | undefined;

/**
 * The defaults layer: spacing, radii, type scale, shadows, and every
 * per-component token, all expressed in terms of the variant tokens.
 *
 * It exists so a theme only has to supply colour. A theme authored through the
 * MCP tools carries nothing but ramps and variants; without this layer its
 * stylesheet would define no fonts, no spacing, and no component tokens, and
 * the compliant stylesheets would render against nothing.
 */
export async function loadDefaultTokens(): Promise<Theme> {
	defaultsPromise ??= (async () => {
		const url = new URL(`./themes/${DEFAULTS_THEME}${THEME_SUFFIX}`, import.meta.url);
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(`Drip: could not read the defaults layer (${res.status} ${res.statusText})`);
		}
		return await res.json() as Theme;
	})();
	return await defaultsPromise;
}

/**
 * Layers a theme on top of the defaults. The theme always wins, key by key, so
 * overriding a single token never costs you the rest of the layer.
 */
export async function withDefaultTokens(theme: Theme): Promise<Theme> {
	const defaults = await loadDefaultTokens();
	return deepMerge(defaults as Record<string, unknown>, theme as Record<string, unknown>) as Theme;
}

async function loadBuiltinTheme(name: string): Promise<Theme | undefined> {
	try {
		const url = new URL(`./themes/${name}${THEME_SUFFIX}`, import.meta.url);
		const res = await fetch(url);
		if (!res.ok) return undefined;
		return await res.json() as Theme;
	} catch {
		return undefined;
	}
}

async function loadCustomTheme(name: string): Promise<Theme | undefined> {
	const file = await dotBearmetalFileUrl<Theme>(namespaces.themes, `${name}${THEME_SUFFIX}`, {
		base: import.meta.url,
	});
	const data = await file.readJson<Theme>();
	return Object.keys(data).length ? data : undefined;
}

export async function loadStylesheet(name: string): Promise<string | undefined> {
	const file = await dotBearmetalFile(namespaces.stylesheets, `${name}.css`);
	const data = await file.read();
	return data ? data : undefined;
}

/** Names of every `.theme.json` a project has defined under `.bearmetal/drip/themes`. */
export async function listCustomThemeNames(): Promise<string[]> {
	const dir = await dotBearmetalDirUrl(namespaces.themes, { base: import.meta.url });
	// missing themes directory - no custom themes
	return (await dir.read())
		?.filter((entry) => entry.isFile && entry.name.endsWith(THEME_SUFFIX))
		.map((entry) => entry.name.slice(0, -THEME_SUFFIX.length))
		.filter((name) => !name.startsWith("_")) ?? [];
}

/**
 * Resolves a theme by name, checking (in order): the runtime registry
 * (`registerTheme`), a project's `.bearmetal/drip/themes/<name>.theme.json`,
 * then BearMetal's bundled themes. The result is layered over the defaults so
 * a colour-only theme still yields a complete stylesheet.
 */
export async function loadTheme(name: string): Promise<Theme> {
	return await withDefaultTokens(await loadRawTheme(name));
}

/** {@linkcode loadTheme} without the defaults layer — the theme file as authored. */
export async function loadRawTheme(name: string): Promise<Theme> {
	const registered = getRegisteredTheme(name);
	if (registered) return registered;
	const custom = await loadCustomTheme(name);
	if (custom) return custom;
	const builtin = await loadBuiltinTheme(name);
	if (builtin) return builtin;
	throw new Error(
		`Drip: no theme named "${name}" found (checked the runtime registry, .bearmetal/drip/themes, and BearMetal's bundled themes).`,
	);
}

export async function getDefaultThemeName(): Promise<string> {
	const config = await readDripConfig();
	return config.defaultTheme ?? "bearmetal";
}

/** The project's configured default theme (`drip.defaultTheme`), falling back to `"bearmetal"`. */
export async function getDefaultTheme(): Promise<Theme> {
	return await loadTheme(await getDefaultThemeName());
}

/**
 * Regenerates CSS for the bundled `bearmetal` theme (unless disabled), every
 * custom theme under `.bearmetal/drip/themes`, and the configured default
 * theme, writing each to `.bearmetal/drip/stylesheets/<name>.css`.
 */
export async function generateStylesheets(): Promise<string[]> {
	const config = await readDripConfig();
	const names = new Set<string>();
	if (!config.disableBearmetal) names.add("bearmetal");
	for (const name of await listCustomThemeNames()) names.add(name);
	if (config.defaultTheme) names.add(config.defaultTheme);

	const written: string[] = [];
	for (const name of names) {
		try {
			const theme = await loadTheme(name);
			const file = await dotBearmetalFile(namespaces.stylesheets, `${name}.css`);
			await file.write(cssFromJson(theme, { name }));
			written.push(name);
		} catch (e) {
			console.error(
				`Drip: failed to generate stylesheet for theme "${name}":`,
				e instanceof Error ? e.message : e,
			);
		}
	}
	return written;
}

export async function listCustomThemes(): Promise<string[]> {
	return await listCustomThemeNames();
}

export function listBuiltinThemes(): string[] {
	return ["bearmetal"];
}
