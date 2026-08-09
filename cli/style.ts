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

/**
 * Reads an environment variable without requiring `--allow-env`.
 *
 * `Deno.env.get` throws when the permission is absent, which would make merely
 * importing this module fatal for an unprivileged script. Query first, and treat
 * anything other than an outright grant as "unset".
 */
function readEnv(name: string): string | undefined {
	try {
		if (Deno.permissions?.querySync?.({ name: "env", variable: name }).state !== "granted") {
			return undefined;
		}
		return Deno.env.get(name);
	} catch {
		return undefined;
	}
}

let colorsEnabled = (() => {
	if (readEnv("FORCE_COLOR")) return true;
	if (readEnv("NO_COLOR")) return false;
	try {
		return Deno.stdout.isTerminal();
	} catch {
		return false;
	}
})();

/**
 * Turns every colour and attribute helper in this module into a pass-through.
 *
 * Defaults to `FORCE_COLOR` > `NO_COLOR` > whether stdout is a TTY. Call this to
 * override — e.g. a session writing to a buffer, or a `--color` flag.
 */
export function setColorEnabled(enabled: boolean) {
	colorsEnabled = enabled;
}

/** Whether colour output is currently enabled. */
export function colorEnabled(): boolean {
	return colorsEnabled;
}

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
	if (!color || !colorsEnabled) return text;
	const c = colorMap[color as keyof typeof colorMap];
	if (!c) {
		if (isHex(color)) return `${ansiTruecolor(color, false)}${text}${currentForegroundReset}`;
		return text;
	}
	return `${c}${text}${currentForegroundReset}`;
}

/** Wraps `text` in a background colour. Unknown names pass the text through untouched. */
export function bgColorize(text: string, color?: ColorName): string {
	if (!color || !colorsEnabled) return text;
	const c = bgColorMap[color as keyof typeof bgColorMap];
	if (!c) {
		if (isHex(color)) return `${ansiTruecolor(color, true)}${text}${currentBackgroundReset}`;
		return text;
	}
	return `${c}${text}${currentBackgroundReset}`;
}

/** Applies each named attribute, innermost first: `stylize(s, "bold", "italic")`. */
export function stylize(text: string, ...styles: StyleName[]): string {
	if (!colorsEnabled) return text;
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
	if (!colorsEnabled) return "";
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `\x1b[${bg ? 48 : 38};2;${r};${g};${b}m`;
}

function isHex(color: string): boolean {
	return color.startsWith("#") && color.length === 7 && !Number.isNaN(parseInt(color.slice(1), 16));
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Every escape sequence form that can appear in styled terminal output.
 *
 * A colour-only pattern (`\x1b\[[0-9;]*m`) is not enough: erase-line, cursor
 * moves, and OSC 8 hyperlinks all occupy zero display columns too, and counting
 * even one of them as text throws off region height by a row — which then
 * corrupts every subsequent frame, permanently.
 */
const ANSI_RE =
	// deno-lint-ignore no-control-regex
	/\x1b(?:\[[0-?]*[ -\/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[PX^_][^\x1b]*\x1b\\|[NO].|[@-Z\\-_])/g;

/** Strips ANSI escape sequences — CSI, OSC, DCS/SOS/PM/APC, SS2/SS3 — leaving only display text. */
export function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

/**
 * Code point ranges the terminal renders two columns wide (East Asian Wide and
 * Fullwidth, plus the emoji blocks).
 */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
	[0x1100, 0x115f],
	[0x2329, 0x232a],
	[0x2e80, 0x303e],
	[0x3041, 0x33ff],
	[0x3400, 0x4dbf],
	[0x4e00, 0x9fff],
	[0xa000, 0xa4cf],
	[0xa960, 0xa97f],
	[0xac00, 0xd7a3],
	[0xf900, 0xfaff],
	[0xfe10, 0xfe19],
	[0xfe30, 0xfe6f],
	[0xff00, 0xff60],
	[0xffe0, 0xffe6],
	[0x1f1e6, 0x1f1ff], // regional indicators — a flag pair renders as one wide glyph
	[0x1f300, 0x1f64f],
	[0x1f680, 0x1f6ff],
	[0x1f900, 0x1f9ff],
	[0x1fa70, 0x1faff],
	[0x20000, 0x2fffd],
	[0x30000, 0x3fffd],
];

function isWide(cp: number): boolean {
	for (const [lo, hi] of WIDE_RANGES) {
		if (cp < lo) return false;
		if (cp <= hi) return true;
	}
	return false;
}

/** Nonspacing marks, enclosing marks, and format characters all occupy zero columns. */
const ZERO_WIDTH_RE = /^[\p{Mn}\p{Me}\p{Cf}]$/u;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function clusterWidth(cluster: string): number {
	const cp = cluster.codePointAt(0);
	if (cp === undefined || cp === 0) return 0;
	// C0/C1 controls render as nothing (or as something unpredictable — either way
	// they are not our columns to count).
	if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
	// U+FE0F forces emoji presentation, which is always double-width even when the
	// base code point is a narrow legacy symbol (e.g. "✔️").
	if (cluster.includes("\uFE0F")) return 2;
	if (ZERO_WIDTH_RE.test(String.fromCodePoint(cp))) return 0;
	return isWide(cp) ? 2 : 1;
}

/**
 * The number of terminal columns `text` occupies, ignoring escape sequences.
 *
 * Grapheme clusters are measured as a unit, so combining marks, variation
 * selectors, and ZWJ emoji sequences each count once rather than once per code
 * point.
 */
export function displayWidth(text: string): number {
	let width = 0;
	for (const { segment } of segmenter.segment(stripAnsi(text))) {
		width += clusterWidth(segment);
	}
	return width;
}

/** Splits `text` into escape sequences and the plain runs between them, in order. */
function tokenize(text: string): { escape: boolean; value: string }[] {
	const tokens: { escape: boolean; value: string }[] = [];
	let last = 0;
	for (const match of text.matchAll(ANSI_RE)) {
		if (match.index > last) tokens.push({ escape: false, value: text.slice(last, match.index) });
		tokens.push({ escape: true, value: match[0] });
		last = match.index + match[0].length;
	}
	if (last < text.length) tokens.push({ escape: false, value: text.slice(last) });
	return tokens;
}

/**
 * Cuts `text` down to at most `maxWidth` display columns, preserving styling.
 *
 * Escape sequences pass through whole — a truncation point never lands inside
 * one — and a reset is appended if the cut leaves styling open, so the colour
 * cannot bleed into whatever the caller writes next. A cluster that would
 * straddle the limit is dropped rather than half-printed.
 */
export function truncateToWidth(text: string, maxWidth: number, ellipsis = ""): string {
	if (maxWidth <= 0) return "";
	if (displayWidth(text) <= maxWidth) return text;

	const budget = maxWidth - displayWidth(ellipsis);
	if (budget <= 0) return "";

	let out = "";
	let width = 0;
	let styled = false;

	for (const token of tokenize(text)) {
		if (token.escape) {
			out += token.value;
			styled = true;
			continue;
		}
		for (const { segment } of segmenter.segment(token.value)) {
			const w = clusterWidth(segment);
			if (width + w > budget) {
				return out + ellipsis + (styled ? resetSequence() : "");
			}
			out += segment;
			width += w;
		}
	}

	return out + ellipsis + (styled ? resetSequence() : "");
}

/**
 * The reset appropriate to the active theme.
 *
 * Mirrors {@linkcode startCliTheme}: a blanket `\x1b[0m` would tear down a
 * theme's background, so once one is installed we close with its specific
 * foreground/background resets instead.
 */
function resetSequence(): string {
	const isBase = currentForegroundReset === FG_RESET && currentBackgroundReset === BG_RESET;
	return isBase ? RESET : currentForegroundReset + currentBackgroundReset;
}

/**
 * How many terminal rows a line occupies at a given width.
 *
 * An empty line still occupies one row. Only meaningful when the renderer is
 * wrapping — the default truncating path guarantees one row per line.
 */
export function rowsForLine(line: string, columns: number): number {
	if (columns <= 0) return 1;
	const width = displayWidth(line);
	return width === 0 ? 1 : Math.ceil(width / columns);
}
