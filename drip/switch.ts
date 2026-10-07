/**
 * Switches a server-rendered page's Drip theme in place, in the browser.
 *
 * `dripModule()` renders each request with the theme its cookies name, into a
 * `<style id="bm-drip-theme">` and `<style id="bm-drip-fonts">`. This swaps the
 * contents of those two elements for the new theme's, sets the variant as
 * `data-theme` on `<html>`, and writes the cookies — so the next page the
 * server renders already agrees, with nothing to flash. Every other open tab
 * on the same origin follows along.
 *
 * Needs `dripModule()` mounted on the server; it is what serves the themes.
 *
 * @example
 * ```ts
 * import { listThemes, onThemeChange, setTheme, setVariant } from "@bearmetal/drip/switch";
 *
 * await setTheme("foxfire");
 * setVariant("dark");
 * setVariant(null); // back to following the OS preference
 * ```
 *
 * @module
 */

import {
	DRIP_BASE,
	FONTS_STYLE_ID,
	THEME_COOKIE,
	THEME_STYLE_ID,
	type ThemeCatalog,
	type ThemeSelection,
	VARIANT_COOKIE,
} from "./selection.ts";

export type { ThemeCatalog, ThemeSelection } from "./selection.ts";

/** Name of the event dispatched on `document` after the theme or variant changes. */
export const THEME_CHANGE_EVENT = "drip:themechange";

const CHANNEL = "bearmetal-drip";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

let catalog: Promise<ThemeCatalog> | undefined;
let channel: BroadcastChannel | undefined;
let latest = 0;

/** The theme and variant the page is showing right now. */
export function getThemeSelection(): ThemeSelection | undefined {
	if (typeof document === "undefined") return undefined;
	const theme = document.getElementById(THEME_STYLE_ID)?.getAttribute("data-drip-theme");
	if (!theme) return undefined;
	const variant = document.documentElement.getAttribute("data-theme") ?? undefined;
	return variant ? { theme, variant } : { theme };
}

/**
 * Every theme the server allows switching to, with its variants. Fetched once
 * and cached for the life of the page.
 */
export function listThemes(): Promise<ThemeCatalog> {
	catalog ??= fetch(`${DRIP_BASE}/themes`).then((res) => {
		if (!res.ok) throw new Error(`Drip: could not list themes (${res.status} ${res.statusText})`);
		return res.json() as Promise<ThemeCatalog>;
	});
	catalog.catch(() => catalog = undefined);
	return catalog;
}

/** Options for {@linkcode setTheme}. */
export interface SetThemeOptions {
	/**
	 * The variant to switch to with it. Left out, the current variant is kept
	 * when the new theme has one by that name and dropped when it does not.
	 * `null` drops it either way.
	 */
	variant?: string | null;
}

/**
 * Switches the page to `name`, fetching its tokens and font sheet from the
 * server. Resolves once the new theme is applied. When calls overlap, the last
 * one wins and earlier ones resolve without applying anything.
 *
 * Rejects if the server is not serving a theme by that name.
 */
export async function setTheme(name: string, options: SetThemeOptions = {}): Promise<void> {
	const call = ++latest;
	const [themes, css, fonts] = await Promise.all([
		listThemes(),
		fetchSheet(`${DRIP_BASE}/themes/${encodeURIComponent(name)}`),
		fetchSheet(`${DRIP_BASE}/fonts/${encodeURIComponent(name)}`),
	]);
	if (call !== latest) return;

	const entry = themes.themes.find((t) => t.name === name);
	const wanted = options.variant === undefined ? getThemeSelection()?.variant : options.variant;
	const variant = wanted && entry?.variants.some((v) => v.name === wanted) ? wanted : undefined;
	const selection: ThemeSelection = variant ? { theme: name, variant } : { theme: name };

	applyTheme(selection, css, fonts);
	persist(selection);
	broadcast({ ...selection, css, fonts });
}

/**
 * Pins the variant (`data-theme` on `<html>`), or with `null` unpins it so the
 * theme's default and media-query variants apply again.
 *
 * Unlike {@linkcode setTheme} this does not check the name against the
 * theme's variants; an unknown one simply matches no variant block.
 */
export function setVariant(variant: string | null): void {
	applyVariant(variant ?? undefined);
	writeCookie(VARIANT_COOKIE, variant ?? undefined);
	broadcast({ variant: variant ?? undefined });
	announce();
}

/**
 * Calls `listener` after every theme or variant change on this page, whether
 * it was made here or in another tab. Returns a function that stops it.
 */
export function onThemeChange(listener: (selection: ThemeSelection) => void): () => void {
	const handler = (event: Event) => listener((event as CustomEvent<ThemeSelection>).detail);
	document.addEventListener(THEME_CHANGE_EVENT, handler);
	return () => document.removeEventListener(THEME_CHANGE_EVENT, handler);
}

async function fetchSheet(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Drip: could not load ${url} (${res.status} ${res.statusText})`);
	return await res.text();
}

function applyTheme(selection: ThemeSelection, css: string, fonts: string): void {
	const theme = styleElement(THEME_STYLE_ID);
	theme.textContent = css;
	theme.setAttribute("data-drip-theme", selection.theme);
	styleElement(FONTS_STYLE_ID).textContent = fonts;
	applyVariant(selection.variant);
	announce();
}

function applyVariant(variant: string | undefined): void {
	if (variant) document.documentElement.setAttribute("data-theme", variant);
	else document.documentElement.removeAttribute("data-theme");
}

/**
 * The element to write a sheet into. Created at the top of `<head>` when the
 * page has none, so the compliant sheets after it still win the cascade.
 */
function styleElement(id: string): HTMLStyleElement {
	const existing = document.getElementById(id);
	if (existing) return existing as HTMLStyleElement;
	const el = document.createElement("style");
	el.id = id;
	document.head.prepend(el);
	return el;
}

function persist(selection: ThemeSelection): void {
	writeCookie(THEME_COOKIE, selection.theme);
	writeCookie(VARIANT_COOKIE, selection.variant);
}

function writeCookie(name: string, value: string | undefined): void {
	const age = value ? COOKIE_MAX_AGE : 0;
	document.cookie = `${name}=${
		encodeURIComponent(value ?? "")
	}; Path=/; Max-Age=${age}; SameSite=Lax`;
}

function announce(): void {
	const detail = getThemeSelection();
	if (detail) document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail }));
}

type Message =
	| (ThemeSelection & { css: string; fonts: string })
	| { variant: string | undefined };

function broadcast(message: Message): void {
	channel?.postMessage(message);
}

function receive({ data }: MessageEvent<Message>): void {
	latest++;
	if ("css" in data) {
		applyTheme(data, data.css, data.fonts);
	} else {
		applyVariant(data.variant);
		announce();
	}
}

if (
	typeof document !== "undefined" && typeof location !== "undefined" &&
	typeof BroadcastChannel !== "undefined"
) {
	channel = new BroadcastChannel(CHANNEL);
	channel.addEventListener("message", receive);
}
