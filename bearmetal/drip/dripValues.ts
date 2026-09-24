import type { Theme } from "@bearmetal/drip";

/** Turns a `$color.path.to.stop` accessor into a `var(--color-path-to-stop)` reference. */
export function parseDripValue(val: string): string {
	if (!val.startsWith("$")) return val;
	return `var(${val.replaceAll(".", "-").replace("$", "--")})`;
}

/**
 * Walks a `$namespace.path.to.token` accessor against the theme it will be
 * resolved in. A miss produces CSS that is invalid at computed-value time —
 * the declaration is dropped and the token silently inherits — so it is worth
 * catching here, where the author can still fix it.
 */
export function accessorResolves(theme: Theme, accessor: string): boolean {
	const path = accessor.slice(1).split(".");
	let node: unknown = theme;
	for (const segment of path) {
		if (!node || typeof node !== "object") return false;
		const record = node as Record<string, unknown>;
		if (!(segment in record)) return false;
		node = record[segment];
	}
	if (typeof node === "string") return true;
	if (node && typeof node === "object") {
		const record = node as Record<string, unknown>;
		return typeof record[""] === "string" || typeof record.base === "string" ||
			"$ref" in record;
	}
	return false;
}
