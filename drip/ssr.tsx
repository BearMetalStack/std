import { compliantCSS } from "./css/compliantCSS.ts";
import { themeCSS } from "./css/generate.ts";
import { getDefaultThemeName, loadTheme } from "./theme.ts";
import { fontFiles, type FontHref, fontHref, type FontKey, themeFontFaceCSS } from "./fonts/mod.ts";
import { FONTS_STYLE_ID, THEME_STYLE_ID, themeSelection } from "./selection.ts";

export { themeSelection } from "./selection.ts";

/**
 * The theme's tokens as a `<style>`. With no `theme`, renders the one this
 * request chose through `dripModule()`, else the project default.
 *
 * The element carries a fixed `id` and the theme's name in `data-drip-theme`,
 * which is what `@bearmetal/drip/switch` finds and swaps in the browser.
 */
export async function ThemeStyle(
	{ theme }: { theme?: string | null },
): Promise<import("@bearmetal/jsx/jsx-runtime").JSX.Element> {
	const name = theme || themeSelection()?.theme || await getDefaultThemeName();
	const data = await loadTheme(name);
	return (
		<style id={THEME_STYLE_ID} data-drip-theme={name} $raw>
			{themeCSS(data, ":root").replaceAll(/\n\s*/g, " ")}
		</style>
	);
}

/** Props for {@linkcode Fonts}. */
export interface FontsProps {
	theme?: string | null;
	/** Families to emit on top of the theme's own defaults. */
	fonts?: FontKey[];
	/**
	 * Link each face from where it is served rather than inlining it — see
	 * {@linkcode FontHref}. `dripModule()` serves them at `/@bearmetal/font-files/`.
	 */
	href?: FontHref;
	/**
	 * Families to `<link rel="preload">`, so a linked face that paints above the
	 * fold starts downloading with the page. Only applies with `href`.
	 */
	preload?: FontKey[];
}

/**
 * Emits the `@font-face` sheet for the self-hosted fonts a theme needs: the
 * lead family of each of its `font.*` roles that Drip hosts (Comfortaa and
 * Monofur, by default), plus any named in `fonts`. Renders nothing when none
 * apply — a theme naming only web-safe or externally loaded fonts.
 *
 * Faces are inlined as `data:` URIs by default, which costs every page the
 * whole set before it can paint. Pass `href` to link served files instead: the
 * browser then fetches only the faces a page uses, caches them, and paints
 * with fallback text meanwhile (`font-display: swap`).
 *
 * Included in {@linkcode BMDripBase}, so a default app self-hosts its fonts
 * with no wiring. Fonts loaded elsewhere (Google Fonts, a CDN) are unaffected.
 */
export async function Fonts(
	{ theme, fonts = [], href, preload = [] }: FontsProps,
): Promise<import("@bearmetal/jsx/jsx-runtime").JSX.Element | null> {
	const name = theme || themeSelection()?.theme || await getDefaultThemeName();
	const sheet = themeFontFaceCSS(await loadTheme(name), fonts, { href });
	if (!sheet) return null;
	const preloads = href ? fontFiles(preload).map((file) => fontHref(href, file)) : [];
	return (
		<>
			{preloads.map((url) => (
				<link
					rel="preload"
					href={url}
					as="font"
					type="font/woff2"
					crossorigin
				/>
			))}
			<style id={FONTS_STYLE_ID} $raw>{sheet}</style>
		</>
	);
}

/** Drip's reset and element styles (`css/base.css`), written against the theme tokens. */
export function BaseStyle(): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return <style $raw>{compliantCSS("base")}</style>;
}

/**
 * Drip's form, button and component styles (`css/components.css`). Pass `root`
 * to nest the whole sheet under a selector.
 */
export function ComponentStyle(
	{ root }: { root?: string },
): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	const style = compliantCSS("components");
	return <style $raw>{root ? `${root} {${style}}` : style}</style>;
}

/**
 * Drip's legible layer (`css/legible.css`): the `--tone-*` set derived from one
 * colour so it reads on any theme and variant, and the `.tag` classes built on
 * it. Included in {@linkcode BMDripBase}.
 */
export function LegibleStyle(): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return <style $raw>{compliantCSS("legible")}</style>;
}

/** Drip's shared keyframes (`css/animations.css`). */
export function Animations(): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return <style $raw>{compliantCSS("animations")}</style>;
}

/**
 * Drip's whole base in one: the theme's tokens, its self-hosted fonts, and the
 * base, component and legible sheets. `fontHref` and `preloadFonts` are
 * {@linkcode Fonts}'s `href` and `preload`.
 *
 * Leave `theme` unset to render whichever theme the request chose through
 * `dripModule()` — passing one pins every page to it and switching stops at
 * the next navigation.
 */
export function BMDripBase(
	{ theme, fontHref, preloadFonts }: {
		theme?: string;
		fontHref?: FontHref;
		preloadFonts?: FontKey[];
	},
): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return (
		<>
			<ThemeStyle theme={theme} />
			<Fonts theme={theme} href={fontHref} preload={preloadFonts} />
			<BaseStyle />
			<ComponentStyle />
			<LegibleStyle />
		</>
	);
}
