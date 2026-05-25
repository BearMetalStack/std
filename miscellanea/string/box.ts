const SEPARATOR = "═";
const TOPL = "╔";
const TOPR = "╗";
const BOTL = "╚";
const BOTR = "╝";
const SIDE = "║";

/** Pads every line to the width of the longest line. */
export function justify(s: string): string {
	const length = s.split("\n").reduce((acc, line) => Math.max(acc, line.length), 0);
	return s.split("\n").map((line) => line.padEnd(length)).join("\n");
}

/** Wraps a multiline string in a double-line box-drawing border. */
export function boxIn(content: string): string {
	const length = content.split("\n").reduce((acc, line) => Math.max(acc, line.length), 0);
	const padding = 1;
	const separator = "".padEnd(length + padding * 2, SEPARATOR);
	return `${TOPL}${separator}${TOPR}\n${
		content.replace(/^/gm, `${SIDE} `).replace(/$/gm, ` ${SIDE}`)
	}\n${BOTL}${separator}${BOTR}`;
}
