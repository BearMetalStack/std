import { NotFound, Ok, type RouterContext, Style, TrustedModule } from "@bearmetal/router";
import type { Theme } from "./types.ts";
import { getDefaultThemeName, loadStylesheet, loadTheme } from "./theme.ts";
import { themeCSS } from "./css/generate.ts";
import { getThemeVariants } from "./css/variants.ts";
import type { CompliantID } from "./css/compliantCSS.ts";
import { fontFaceCSS, fontFile, themeFontFaceCSS } from "./fonts/mod.ts";
import {
	DRIP_BASE,
	DRIP_SELECTION,
	THEME_COOKIE,
	type ThemeCatalog,
	type ThemeSelection,
	VARIANT_COOKIE,
} from "./selection.ts";

/** Where `dripModule()` serves the font files its font sheets link to. */
export const FONT_FILES = "/@bearmetal/font-files/";

/** Options for {@linkcode dripModule}. */
export interface DripModuleOptions {
	/**
	 * Themes a page may switch to, by name. The first is what a request with no
	 * choice gets. Defaults to the project's configured default theme alone.
	 * Nothing outside this list is ever loaded on a visitor's say-so.
	 */
	themes?: string[];
	/**
	 * Where a request's choice comes from before the cookies are consulted — a
	 * signed-in user's saved preference, say. Return `undefined` (or leave a field
	 * out) to fall through to the cookie. The answer is held to the same
	 * allowlist as the cookie.
	 */
	resolve?: (
		ctx: RouterContext,
	) => Partial<ThemeSelection> | undefined | Promise<Partial<ThemeSelection> | undefined>;
}

class DripModule extends TrustedModule {
	#themes: Promise<Map<string, Theme>>;
	#default: Promise<string>;
	#stylesheet: string | null = null;
	#resolve: DripModuleOptions["resolve"];

	constructor(options: DripModuleOptions) {
		super("@bearmetal/drip");
		const names = options.themes?.length ? options.themes : undefined;
		this.#default = names ? Promise.resolve(names[0]) : getDefaultThemeName();
		this.#themes = this.#default.then(async (fallback) => {
			const list = names ?? [fallback];
			return new Map(await Promise.all(list.map(async (n) => [n, await loadTheme(n)] as const)));
		});
		this.#resolve = options.resolve;
		this.init();
	}

	init() {
		this.use(async (ctx, next) => {
			const state = ctx.state as { renderContext?: Record<string, unknown> };
			state.renderContext = {
				...state.renderContext,
				[DRIP_SELECTION]: await this.selectionFor(ctx as RouterContext),
			};
			return await next();
		});

		this.route(`${DRIP_BASE}/themes`).get(async () => Ok(await this.catalog()));
		this.route(`${DRIP_BASE}/themes/:name`).get(async (ctx) => {
			const theme = (await this.#themes).get(ctx.params.name ?? "");
			if (!theme) return NotFound(`Drip is not serving a theme named "${ctx.params.name}"`);
			return Style(themeCSS(theme, ":root"));
		});
		this.route(`${DRIP_BASE}/fonts/:name`).get(async (ctx) => {
			const theme = (await this.#themes).get(ctx.params.name ?? "");
			if (!theme) return NotFound(`Drip is not serving a theme named "${ctx.params.name}"`);
			return Style(themeFontFaceCSS(theme, [], { href: FONT_FILES }));
		});

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
			const theme = (await this.#themes).get(await this.#default);
			return Style(theme ? themeFontFaceCSS(theme) : "");
		});
		this.route("/@bearmetal/fonts/:name").get((ctx) => {
			const name = ctx.params.name ?? "";
			const sheet = fontFaceCSS([name]);
			return sheet ? Style(sheet) : NotFound(`Drip does not self-host a font named "${name}"`);
		});
		this.route("/@bearmetal/font-files/:family/:file").get((ctx) => {
			const file = `${ctx.params.family}/${ctx.params.file}`;
			const bytes = fontFile(file);
			if (!bytes) return NotFound(`Drip does not ship a font file "${file}"`);
			return new Response(bytes, {
				headers: {
					"Content-Type": "font/woff2",
					"Cache-Control": "public, max-age=604800",
				},
			});
		});
	}

	/**
	 * The theme a request renders with: `resolve()`'s answer, else the cookies,
	 * else the default — the theme checked against the allowlist, and the
	 * variant against the theme it ends up with.
	 */
	async selectionFor(ctx: RouterContext): Promise<ThemeSelection> {
		const themes = await this.#themes;
		const resolved = await this.#resolve?.(ctx);
		const requested = resolved?.theme ?? cookie(ctx, THEME_COOKIE);
		const theme = requested && themes.has(requested) ? requested : await this.#default;
		const variant = resolved?.variant ?? cookie(ctx, VARIANT_COOKIE);
		const variants = getThemeVariants(themes.get(theme) ?? {});
		return variant && variants.some((v) => v.name === variant) ? { theme, variant } : { theme };
	}

	/** Every switchable theme and its variants. */
	async catalog(): Promise<ThemeCatalog> {
		const themes = await this.#themes;
		return {
			default: await this.#default,
			themes: [...themes].map(([name, theme]) => ({
				name,
				variants: getThemeVariants(theme).map(({ name, media, default: isDefault }) => ({
					name,
					...(media ? { media } : {}),
					...(isDefault ? { default: true } : {}),
				})),
			})),
		};
	}

	async constructStylesheet(): Promise<string> {
		const themes = await this.#themes;
		return [...themes.values()].map((t) => themeCSS(t, ":root")).join("\n\n");
	}
}

function cookie(ctx: RouterContext, name: string): string | undefined {
	const raw = ctx.cookies.get(name);
	if (!raw) return undefined;
	try {
		return decodeURIComponent(raw);
	} catch {
		return undefined;
	}
}

/**
 * Drip as a router module: serves the theme stylesheets and self-hosted fonts,
 * and makes the theme switchable per visitor.
 *
 * Each request's choice is read from the `bm-drip-theme`/`bm-drip-variant`
 * cookies (or `resolve`) and scoped into the page render, so `BMDripBase`
 * renders the chosen theme and `themeSelection()` reports it. The browser half,
 * `@bearmetal/drip/switch`, swaps the theme in place and writes the cookies, so
 * the next server render agrees with it.
 *
 * Mount it before the layout and routes, so its middleware runs ahead of them.
 *
 * @example
 * ```ts
 * router.use(dripModule({ themes: ["bearmetal", "foxfire", "pride"] }));
 * ```
 */
export function dripModule(options?: DripModuleOptions): TrustedModule;
/** Shorthand for `dripModule({ themes: includedThemes })`. */
export function dripModule(...includedThemes: string[]): TrustedModule;
export function dripModule(
	first?: DripModuleOptions | string,
	...rest: string[]
): TrustedModule {
	if (typeof first === "object") return new DripModule(first);
	return new DripModule({ themes: first === undefined ? [] : [first, ...rest] });
}
