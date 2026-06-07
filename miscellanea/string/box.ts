const SEPARATOR = "═";
const TOPL = "╔";
const TOPR = "╗";
const BOTL = "╚";
const BOTR = "╝";
const SIDE = "║";

/** Pads every line to the width of the longest line or provided width. */
export function justify(s: string, len?: number): string {
	const length = len ?? s.split("\n").reduce((acc, line) => Math.max(acc, line.length), 0);
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

export function longestLine(str: string): number {
	return str.split("\n").reduce((acc, line) => Math.max(acc, line.length), 0);
}

export function center(s: string, width?: number): string {
	const length = width ?? s.split("\n").reduce((acc, line) => Math.max(acc, line.length), 0);
	return s.split("\n").map((line) =>
		line.padStart((length - line.length) / 2 + line.length).padEnd(length)
	).join("\n");
}

export function centerKeepAligned(s: string, width: number): string {
	const longest = longestLine(s);
	const frontPadding = (width - longest) / 2;
	return s.split("\n").map((line) => line.padStart(frontPadding + line.length).padEnd(width)).join(
		"\n",
	);
}
