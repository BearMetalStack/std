import type { BMC } from "@bearmetal/jsx";

type BmElementConstructor = {
	new (...args: any[]): BMC;
	tag: string;
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
		const moduleUrl = meta?.url;
		target.tag = tag;
		if (typeof document !== "undefined") {
			context.addInitializer(function () {
				if (typeof customElements === "undefined") return;
				if (!customElements.get(tag)) {
					customElements.define(tag, target as unknown as CustomElementConstructor);
				}
			});
		} else if (moduleUrl) {
			registry.set(tag, moduleUrl);
		}
	};
}
