import { compliantCSS } from "./css/compliantCSS.ts";
import { themeCSS } from "./css/generate.ts";
import { getDefaultTheme, loadTheme } from "./theme.ts";
import { type FontKey, themeFontFaceCSS } from "./fonts/mod.ts";

export async function ThemeStyle(
	{ theme }: { theme?: string | null },
): Promise<import("@bearmetal/jsx/jsx-runtime").JSX.Element> {
	const data = theme ? await loadTheme(theme) : await getDefaultTheme();
	return <style id="thingy" $raw>{themeCSS(data, ":root").replaceAll(/\n\s*/g, " ")}</style>;
}

/**
 * Emits the `@font-face` sheet for the self-hosted fonts a theme needs: the
 * lead family of each of its `font.*` roles that Drip hosts (Comfortaa and
 * Monofur, by default), plus any named in `fonts`. Renders nothing when none
 * apply — a theme naming only web-safe or externally loaded fonts.
 *
 * Included in {@linkcode BMDripBase}, so a default app self-hosts its fonts
 * with no wiring. Fonts loaded elsewhere (Google Fonts, a CDN) are unaffected.
 */
export async function Fonts(
	{ theme, fonts = [] }: { theme?: string | null; fonts?: FontKey[] },
): Promise<import("@bearmetal/jsx/jsx-runtime").JSX.Element | null> {
	const data = theme ? await loadTheme(theme) : await getDefaultTheme();
	const sheet = themeFontFaceCSS(data, fonts);
	return sheet ? <style $raw>{sheet}</style> : null;
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

/** Drip's shared keyframes (`css/animations.css`). */
export function Animations(): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return <style $raw>{compliantCSS("animations")}</style>;
}

export function BMDripBase(
	{ theme }: { theme?: string },
): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return (
		<>
			<ThemeStyle theme={theme} />
			<Fonts theme={theme} />
			<BaseStyle />
			<ComponentStyle />
		</>
	);
}
