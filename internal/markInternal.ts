const registry = new WeakSet<object>();

export function markInternal(instance: object): void {
	registry.add(instance);
}

export function isInternal(instance: object): boolean {
	if (!instance) return false;
	return registry.has(instance);
}
