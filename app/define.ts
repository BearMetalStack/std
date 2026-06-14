import type { BMC } from "@bearmetal/jsx";

type BmElementConstructor = {
	new (...args: any[]): BMC;
	tag: string;
	stylesheet?: string;
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
		if (!isValidComponentName(tag)) tag = "my-" + tag;
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
				const style = document.createElement("style");
				style.textContent = s.replaceAll(/:scope/gm, tag);
				style.id = tag;
				document.head.appendChild(style);
			}
		} else if (moduleUrl) {
			registry.set(tag, moduleUrl);
			const s = target.stylesheet;
			if (s) stylesheetRegistry.set(tag, s.replaceAll(/:scope/gm, tag));
		}
	};
}

function isValidComponentName(tag: string) {
	return /^[a-z][a-z0-9]+(-[a-z0-9]+)+$/.test(tag);
}
