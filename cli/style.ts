/**
 * ANSI text styling.
 *
 * Every helper closes with the *specific* reset for what it opened (`39` for
 * foreground, `49` for background, `22`/`23`/`24`... for attributes) rather
 * than the blanket `0`. A blanket reset would mean the inner call of
 * `colorize(bold(text), "red")` tore down the red before the outer call was
 * done with it, so nesting silently lost styles.
 * @module
 */

/** Foreground color reset */
export const FG_RESET = "\x1b[39m";
/** Background color reset */
export const BG_RESET = "\x1b[49m";
let currentForegroundReset = FG_RESET;
let currentBackgroundReset = BG_RESET;
/** sets the fg reset */
export function setFGReset(s: string) {
	currentForegroundReset = s;
}
/** get the current fg reset */
export function getFGReset(): string {
	return currentForegroundReset;
}
/** sets the bg reset */
export function setBGReset(s: string) {
	currentBackgroundReset = s;
}
/** get the current bg reset */
export function getBGReset(): string {
	return currentBackgroundReset;
}

/** Clears every attribute, colour, and background at once. */
export const RESET = "\x1b[0m";

/** map of ansi foreground colors */
export const colorMap: Record<string, string> = {
	purple: "\x1b[35m",
	porple: "\x1b[38;2;170;85;238m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	black: "\x1b[30m",
	gray: "\x1b[90m",
	get grey() {
		return this.gray;
	},
} as const;

/** map of ansi background colors */
export const bgColorMap: Record<string, string> = {
	purple: "\x1b[45m",
	porple: "\x1b[48;2;170;85;238m",
	red: "\x1b[41m",
	green: "\x1b[42m",
	yellow: "\x1b[43m",
	blue: "\x1b[44m",
	cyan: "\x1b[46m",
	white: "\x1b[47m",
	black: "\x1b[40m",
	gray: "\x1b[100m",
	get grey() {
		return this.gray;
	},
} as const;

/**
 * Open/close pairs for the SGR attributes.
 *
 * `bold` and `dim` share the `22` reset, so nesting one inside the other ends
 * both. That is a limitation of the terminal, not of this code.
 */
export const styleMap = {
	bold: ["\x1b[1m", "\x1b[22m"],
	dim: ["\x1b[2m", "\x1b[22m"],
	italic: ["\x1b[3m", "\x1b[23m"],
	underline: ["\x1b[4m", "\x1b[24m"],
	inverse: ["\x1b[7m", "\x1b[27m"],
	hidden: ["\x1b[8m", "\x1b[28m"],
	strikethrough: ["\x1b[9m", "\x1b[29m"],
} as const satisfies Record<string, readonly [string, string]>;

/** #{string} */
export type hexString = `#${string}`;

/** A named attribute understood by {@linkcode stylize}. */
export type StyleName = keyof typeof styleMap;

/** A named colour, or a `#rrggbb` truecolor literal. */
export type ColorName = keyof typeof colorMap | hexString;

/** Wraps `text` in a foreground colour. Unknown names pass the text through untouched. */
export function colorize(text: string, color?: ColorName): string {
	if (!color) return text;
	const c = colorMap[color as keyof typeof colorMap];
	if (!c) {
		if (isHex(color)) return `${ansiTruecolor(color, false)}${text}${currentForegroundReset}`;
		return text;
	}
	return `${c}${text}${currentForegroundReset}`;
}

/** Wraps `text` in a background colour. Unknown names pass the text through untouched. */
export function bgColorize(text: string, color?: ColorName): string {
	if (!color) return text;
	const c = bgColorMap[color as keyof typeof bgColorMap];
	if (!c) {
		if (isHex(color)) return `${ansiTruecolor(color, true)}${text}${currentBackgroundReset}`;
		return text;
	}
	return `${c}${text}${currentBackgroundReset}`;
}

/** Applies each named attribute, innermost first: `stylize(s, "bold", "italic")`. */
export function stylize(text: string, ...styles: StyleName[]): string {
	return styles.reduce((acc, name) => {
		const pair = styleMap[name];
		if (!pair) return acc;
		const [open, close] = pair;
		return `${open}${acc}${close}`;
	}, text);
}

/** stylize bold */
export const bold = (text: string): string => stylize(text, "bold");
/** stylize dim */
export const dim = (text: string): string => stylize(text, "dim");
/** stylize italic */
export const italic = (text: string): string => stylize(text, "italic");
/** stylize underline */
export const underline = (text: string): string => stylize(text, "underline");
/** stylize inverse */
export const inverse = (text: string): string => stylize(text, "inverse");
/** stylize hidden */
export const hidden = (text: string): string => stylize(text, "hidden");
/** stylize strikethrough */
export const strikethrough = (text: string): string => stylize(text, "strikethrough");

/** The SGR sequence for a `#rrggbb` colour, as foreground or background. */
export function ansiTruecolor(hex: string, bg = true): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `\x1b[${bg ? 48 : 38};2;${r};${g};${b}m`;
}

function isHex(color: string): boolean {
	return color.startsWith("#") && color.length === 7 && !Number.isNaN(parseInt(color.slice(1), 16));
}
