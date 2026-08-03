import type { BMC } from "@bearmetal/jsx";
import { isBrowser } from "./util/environment.ts";

type BmElementConstructor = {
	new (...args: any[]): BMC;
	tag: string;
	stylesheet?: string | CSSStyleSheet;
};

const registry = new Map<string, string>();
const stylesheetRegistry = new Map<string, string>();

export function registerComponent(tag: string, url: string): void {
	registry.set(tag, url);
}
export function getComponentUrl(tag: string): string | undefined {
	return registry.get(tag);
}
export function getTagStylesheet(tag: string): string | undefined {
	return stylesheetRegistry.get(tag);
}
export function getAllStylesheets(): string {
	return stylesheetRegistry.values().toArray().join("\n");
}

export function define(
	tag: string,
	meta?: ImportMeta,
): <T extends BmElementConstructor>(target: T, context: ClassDecoratorContext) => void {
	return function <T extends BmElementConstructor>(
		target: T,
		context: ClassDecoratorContext,
	) {
		tag = normalizeComponentName(tag);
		const moduleUrl = meta?.url;
		target.tag = tag;

		// Register the element wherever there is a registry to register it with.
		// A server has one now — the microdom's — and that is precisely what lets
		// one component render on both sides, so this can no longer be gated on
		// `typeof document`.
		context.addInitializer(function () {
			if (typeof customElements === "undefined") return;
			if (!customElements.get(tag)) {
				customElements.define(tag, target as unknown as CustomElementConstructor);
			}
		});

		// The registries the SSR bundler reads: where to find a tag's client
		// module, and what CSS to inline for it. Filled in unconditionally — the
		// cost is two Map entries, and the alternative is a component that
		// silently ships without styles depending on where it was first imported.
		if (moduleUrl) registry.set(tag, moduleUrl);
		const s = target.stylesheet;
		if (typeof s === "string") stylesheetRegistry.set(tag, s.replaceAll(/:scope/gm, tag));

		// Adopting a stylesheet into `document.head`, on the other hand, is only
		// meaningful in a browser. Doing it server-side would pile every
		// component's CSS into one long-lived microdom that no response ever
		// serializes.
		if (!isBrowser() || !s) return;

		if (!document.head.querySelector(`style#${tag}`)) {
			if (s instanceof CSSStyleSheet) {
				document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
			} else {
				const style = document.createElement("style");
				style.textContent = s.replaceAll(/:scope/gm, tag);
				style.id = tag;
				document.head.appendChild(style);
			}
		}
	};
}

function isValidComponentName(tag: string) {
	return /^[a-z][a-z0-9]+(-[a-z0-9]+)+$/.test(tag);
}

/**
 * Coerces a user-supplied tag into a valid custom element name.
 *
 * Punctuation and camelCase boundaries become word breaks, words are joined
 * with hyphens, and a `my-` prefix is added if the result still lacks the
 * hyphen that the custom element spec requires.
 *
 * Already-valid names pass through unchanged.
 *
 * @example
 * normalizeComponentName("My Component");            // "my-component"
 * normalizeComponentName("My *very cool* Component") // "my-very-cool-component"
 * normalizeComponentName("component");               // "my-component"
 */
export function normalizeComponentName(tag: string): string {
	const words = tag
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.trim()
		.toLowerCase();

	if (!words) {
		throw new Error(
			`@define("${tag}") does not contain any alphanumeric characters to build a tag name from.`,
		);
	}

	const normalized = words.replace(/\s+/g, "-");
	if (isValidComponentName(normalized)) return normalized;

	const prefixed = `my-${normalized}`;
	if (isValidComponentName(prefixed)) return prefixed;

	throw new Error(
		`@define("${tag}") normalizes to "${prefixed}", which is not a valid custom element name.`,
	);
}
