/** Adds `depth` tab characters to the start of every line. */
export function indent(s: string, depth = 1): string {
	return s.replaceAll(/^/gm, "\t".repeat(depth));
}

/** Removes the common leading tab indentation from every line. */
export function dedent(s: string): string {
	const rx = /^\t*/gm;
	const matches = s.matchAll(rx);
	const minIndent = Math.min(...matches.map((m) => m[0].length));
	return s.replaceAll("\t".repeat(minIndent), "");
}
