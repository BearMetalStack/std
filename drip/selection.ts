/**
 * The contract between Drip's server and browser halves for which theme a page
 * shows: the names of the cookies that carry the choice, where the switchable
 * themes are served, and the render-context key a server render reads it from.
 *
 * @module
 */

import { getContextItemOrDefault } from "@bearmetal/app/context";

/** A theme and, optionally, one of its variants (`data-theme`). */
export interface ThemeSelection {
	/** The theme's name, as `loadTheme` resolves it. */
	theme: string;
	/**
	 * A variant to pin with `data-theme` on `<html>`. Unset follows the theme's
	 * own default and media-query variants (light/dark by OS preference).
	 */
	variant?: string;
}

/** A variant as the theme catalog describes it. */
export interface ThemeCatalogVariant {
	name: string;
	media?: string;
	default?: boolean;
}

/** What `GET /@bearmetal/drip/themes` answers with: every theme a page may switch to. */
export interface ThemeCatalog {
	/** The theme a request without a choice gets. */
	default: string;
	themes: { name: string; variants: ThemeCatalogVariant[] }[];
}

/** Cookie holding the chosen theme's name. */
export const THEME_COOKIE = "bm-drip-theme";
/** Cookie holding the chosen variant's name. Absent means "follow the theme". */
export const VARIANT_COOKIE = "bm-drip-variant";
/** Where `dripModule()` serves the switchable themes. */
export const DRIP_BASE = "/@bearmetal/drip";
/** Render-context key `dripModule()` puts the request's {@linkcode ThemeSelection} under. */
export const DRIP_SELECTION = "bearmetal.drip.selection";

/** `id` of the `<style>` holding the theme's tokens, which the browser half swaps. */
export const THEME_STYLE_ID = "bm-drip-theme";
/** `id` of the `<style>` holding the theme's `@font-face` sheet. */
export const FONTS_STYLE_ID = "bm-drip-fonts";

/**
 * The theme the current server render was asked for, or `undefined` outside a
 * render or when `dripModule()` is not mounted. Read it synchronously — in a
 * layout's body, not after an `await` — since the render scope is a call stack.
 *
 * @example
 * ```tsx
 * export const page = Layout((props) => (
 *   <html lang="en" data-theme={themeSelection()?.variant}>…</html>
 * ));
 * ```
 */
export function themeSelection(): ThemeSelection | undefined {
	return getContextItemOrDefault<ThemeSelection | undefined>(DRIP_SELECTION, undefined);
}
