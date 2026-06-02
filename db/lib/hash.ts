function stableStringify(val: unknown): string {
	if (val === null || typeof val !== "object") return JSON.stringify(val);
	if (Array.isArray(val)) return `[${val.map(stableStringify).join(",")}]`;
	const obj = val as Record<string, unknown>;
	const pairs = Object.keys(obj).sort().map((k) =>
		`${JSON.stringify(k)}:${stableStringify(obj[k])}`
	);
	return `{${pairs.join(",")}}`;
}

// FNV-1a 32-bit - deterministic, sync, good enough for migration IDs
export function schemaHash(jsonSchema: unknown): string {
	const str = stableStringify(jsonSchema);
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `schema_${h.toString(16).padStart(8, "0")}`;
}
