export function indent(s: string, depth = 1) {
	return s.replaceAll(/^/gm, "\t".repeat(depth));
}

export function dedent(s: string) {
	const rx = /^\t*/gm;
	const matches = s.matchAll(rx);
	const minIndent = Math.min(...matches.map((m) => m[0].length));
	return s.replaceAll("\t".repeat(minIndent), "");
}
