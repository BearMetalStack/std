import { themeCSS } from "./css/generate.ts";
import type { Theme } from "./types.ts";

export function injectStyle(id: string, css: string): void {
	if (typeof document === "undefined" || document.getElementById(id)) return;
	const el = document.createElement("style");
	el.id = id;
	el.textContent = css;
	document.head.appendChild(el);
}

type ThemeEntry = {
	data?: Theme;
	scopes: Set<string>;
};

const registry = new Map<string, ThemeEntry>();

export function registerTheme(name: string, data: Theme): void {
	const entry = registry.get(name);
	if (entry) {
		entry.data = data;
		_updateTheme(name, entry);
	} else {
		registry.set(name, { data, scopes: new Set() });
	}
}

export function theme(name: string, scope: string = ":root"): void {
	let entry = registry.get(name);
	if (!entry) {
		entry = { scopes: new Set() };
		registry.set(name, entry);
	}
	if (entry.scopes.has(scope)) return;
	entry.scopes.add(scope);
	_updateTheme(name, entry);
}

export function getRegisteredTheme(name: string): Theme | undefined {
	return registry.get(name)?.data;
}

function _updateTheme(name: string, entry: ThemeEntry): void {
	if (typeof document === "undefined" || !entry.data || !entry.scopes.size) return;
	const id = `bm-theme-${name}`;
	const selector = [...entry.scopes].join(", ");
	const css = themeCSS(entry.data, selector);
	let el = document.getElementById(id) as HTMLStyleElement | null;
	if (!el) {
		el = document.createElement("style");
		el.id = id;
		document.head.insertBefore(el, document.head.firstChild);
	}
	el.textContent = css;
}
