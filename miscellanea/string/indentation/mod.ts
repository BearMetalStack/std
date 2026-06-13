import { fn } from "../../function/mod.ts";
import type { TagFn } from "../../types.ts";

/** Adds `depth` tab characters to the start of every line. */
export function indent(s: string, depth = 1): string {
	return s.replaceAll(/^/gm, "\t".repeat(depth));
}

/** Removes the common leading tab indentation from every line. */
export function dedent(s: string, tabSpaces = 4, preferSpaces = false): string {
	const space = " ".repeat(tabSpaces);
	s = s.replaceAll(
		new RegExp(`^(\\t|${space})+`, "gm"),
		(e) => e.replaceAll(space, "\t"),
	);
	const rx = /^(\t)+/gm;
	const matches = s.matchAll(rx).toArray();
	const minIndent = Math.min(...matches.map((m) => m[0].length));
	s = s.replaceAll(new RegExp(`^\\t{${minIndent}}`, "gm"), "");
	if (preferSpaces) s = s.replaceAll(/^\t/gm, (e) => e.replaceAll("\t", space));

	return s;
}

function trimIndented(s: string) {
	return s.replace(/^\n*/, "").replace(/\t*$/, "");
}

/** Tagged template to dedent the text with automatic space detection */
// export function dedented(strings: TemplateStringsArray, ...values: any[]): string {
// 	const s = String.raw(strings, ...values);
// 	const leading = s.matchAll(/^ +/gm).toArray().map((e) => e[0].length);
// 	if (!leading.length) return dedent(s);
// 	const minspace = Math.min(...leading);
// 	let spacing = minspace;
// 	while (!leading.every((e) => e % spacing === 0)) {
// 		spacing--;
// 	}
// 	return dedent(s, minspace);
// }
export const dedented: TagFn = fn(String.raw).follow(trimIndented).follow((s) => {
	const leading = s.matchAll(/^ +/gm).toArray().map((e) => e[0].length);
	const minspace = leading.length ? Math.min(...leading) : 4;
	return dedent(s, minspace);
});
