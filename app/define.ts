import type { BMC } from "@bearmetal/jsx";

type BmElementConstructor = {
	new (...args: any[]): BMC;
	tag: string;
	stylesheet?: string;
};

const registry = new Map<string, string>();
export function registerComponent(tag: string, url: string) {
	registry.set(tag, url);
}
export function getComponentUrl(tag: string) {
	return registry.get(tag);
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
			if (s) {
				const style = document.head.querySelector("style#" + tag) ??
					document.createElement("style");
				style.textContent = s.replaceAll(/:scope/gm, tag);
				document.head.appendChild(style);
			}
		} else if (moduleUrl) {
			registry.set(tag, moduleUrl);
		}
	};
}

function isValidComponentName(tag: string) {
	return /^[a-z][a-z0-9]+(-[a-z0-9]+)+$/.test(tag);
}
