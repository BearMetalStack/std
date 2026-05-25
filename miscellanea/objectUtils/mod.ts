export function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
	const result = structuredClone(base) as Record<string, unknown>;
	for (const [key, value] of Object.entries(override)) {
		if (
			value && typeof value === "object" && !Array.isArray(value) && key in result &&
			typeof result[key] === "object"
		) {
			result[key] = deepMerge(
				result[key] as Record<string, unknown>,
				value as Record<string, unknown>,
			);
		} else {
			result[key] = value;
		}
	}
	return result as T;
}
