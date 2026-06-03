import type { BMC } from "@bearmetal/jsx";

type BmElementConstructor = {
	// deno-lint-ignore no-explicit-any
	new (...args: any[]): BMC;
	tag: string;
};

export function define(tag: string) {
	return function <T extends BmElementConstructor>(
		target: T,
		context: ClassDecoratorContext,
	) {
		context.addInitializer(function () {
			if (typeof customElements === "undefined") return;
			if (!customElements.get(tag)) {
				customElements.define(tag, target as unknown as CustomElementConstructor);
			}
		});
		target.tag = tag;
	};
}
