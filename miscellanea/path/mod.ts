/**
 * Path joining and classification utilities.
 * @module
 */

/**
 * Joins path segments and resolves `.`, `..`, and glob `*` wildcards.
 * Preserves a leading `/` if the first segment is absolute.
 * @example joinPath("/foo", "../bar", "./baz") // "/bar/baz"
 */
export function joinPath(...paths: string[]): string {
	const leading = paths[0]?.startsWith("/") ?? false;
	const segments = paths.flatMap((p) => p.split("/")).reduce((a, b) => {
		if (b === ".." || a.at(-1) === "*") a.pop();
		else if (b !== "." && b !== "") a.push(b);
		return a;
	}, [] as string[]).filter(Boolean);
	return (leading ? "/" : "") + segments.join("/");
}

/** Naively returns the parent directory of the given item */
export function directoryOf(path: string): string {
	return path.split("/").slice(0, -1).join("/") || "/";
}

/** Returns `true` only for paths starting with `./` or `../` (not bare names or absolute paths). */
export function isRelativePath(path: string): boolean {
	return !path.startsWith("/") &&
		(path.startsWith("./") || path.startsWith("../"));
}
