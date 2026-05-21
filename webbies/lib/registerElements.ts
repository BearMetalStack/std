export function registerElements(
	...elements: [string, CustomElementConstructor, ElementDefinitionOptions?][]
) {
	if (typeof customElements === "undefined") return;
	for (const [key, element, options] of elements) {
		registerElement(key, element, options);
	}
}

export function registerElement(
	key: string,
	element: CustomElementConstructor,
	options?: ElementDefinitionOptions,
) {
	if (typeof customElements === "undefined") return;
	if (!customElements.get(key)) customElements.define(key, element, options);
}
