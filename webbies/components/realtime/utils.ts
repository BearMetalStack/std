export function parseData(raw: string): Record<string, string> {
	try {
		return JSON.parse(raw);
	} catch {
		return { data: raw };
	}
}

export function populateFields(
	root: DocumentFragment | HTMLElement,
	parsed: Record<string, string>,
	fieldAttr: string,
): void {
	for (const el of root.querySelectorAll<HTMLElement>(`[${fieldAttr}]`)) {
		const field = el.getAttribute(fieldAttr)!;
		if (field in parsed) el.textContent = parsed[field];
	}
}

export function appendToContainer(
	container: HTMLElement,
	parsed: Record<string, string>,
	fieldAttr: string,
	maxAttr: string,
): void {
	const templateEl = container.querySelector<HTMLTemplateElement>(
		":scope > template",
	);
	if (!templateEl) return;

	const clone = templateEl.content.cloneNode(true) as DocumentFragment;
	populateFields(clone, parsed, fieldAttr);
	container.appendChild(clone);

	const maxStr = container.getAttribute(maxAttr);
	if (maxStr) {
		const max = parseInt(maxStr, 10);
		if (!isNaN(max) && max > 0) {
			const children = Array.from(container.children).filter(
				(c) => c.tagName !== "TEMPLATE",
			);
			while (children.length > max) {
				children.shift()!.remove();
			}
		}
	}
}

export function swapContainer(
	container: HTMLElement,
	parsed: Record<string, string>,
	fieldAttr: string,
): void {
	populateFields(container, parsed, fieldAttr);
}
