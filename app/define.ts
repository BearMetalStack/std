import type { BMC } from "@bearmetal/jsx";

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
		if (typeof document !== "undefined") {
			context.addInitializer(function () {
				if (typeof customElements === "undefined") return;
				if (!customElements.get(tag)) {
					customElements.define(tag, target as unknown as CustomElementConstructor);
				}
			});
			const s = target.stylesheet;
			if (s && !document.head.querySelector(`style#${tag}`)) {
				if (s instanceof CSSStyleSheet) {
					document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
				} else {
					const style = document.createElement("style");
					style.textContent = s.replaceAll(/:scope/gm, tag);
					style.id = tag;
					document.head.appendChild(style);
				}
			}
		} else {
			if (moduleUrl) registry.set(tag, moduleUrl);
			const s = target.stylesheet;
			if (typeof s === "string") stylesheetRegistry.set(tag, s.replaceAll(/:scope/gm, tag));
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
