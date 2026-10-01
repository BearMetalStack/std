import type { TextAlign, TextBaseline } from "../types.ts";
import { Path } from "../geometry/path.ts";
import type { Font } from "./ttf.ts";

/** A positioned glyph; `x` is in world units from the line's start. */
export interface PlacedGlyph {
	glyph: number;
	x: number;
}

/** One laid-out line. */
export interface TextLine {
	glyphs: PlacedGlyph[];
	width: number;
}

/** The result of {@linkcode layoutText}. */
export interface TextLayout {
	lines: TextLine[];
	/** Widest line. */
	width: number;
	/** `lines.length * lineHeight`. */
	height: number;
	size: number;
	lineHeight: number;
	/** Distance from a line's top to its baseline. */
	ascent: number;
}

/** Options for {@linkcode layoutText}. */
export interface LayoutOptions {
	size?: number;
	maxWidth?: number;
	/** Multiple of `size`. Default `1.2`. */
	lineHeight?: number;
}

function shapeRun(font: Font, text: string, scale: number): TextLine {
	const glyphs: PlacedGlyph[] = [];
	let x = 0;
	let prev = -1;
	for (const ch of text) {
		const g = font.glyphIndex(ch.codePointAt(0)!);
		if (prev >= 0) x += font.kerning(prev, g) * scale;
		glyphs.push({ glyph: g, x });
		x += font.advance(g) * scale;
		prev = g;
	}
	return { glyphs, width: x };
}

/** Width of a single line of text, in world units. */
export function measureText(font: Font, text: string, size = 14): number {
	return shapeRun(font, text, size / font.unitsPerEm).width;
}

/**
 * Lays text out into lines: honours `\n`, wraps greedily on spaces when `maxWidth` is set, and
 * breaks inside a word only when the word alone is wider than `maxWidth`. Left to right only;
 * no bidi or complex shaping.
 */
export function layoutText(font: Font, text: string, opts: LayoutOptions = {}): TextLayout {
	const size = opts.size ?? 14;
	const scale = size / font.unitsPerEm;
	const lineHeight = (opts.lineHeight ?? 1.2) * size;
	const max = opts.maxWidth;
	const lines: TextLine[] = [];
	for (const para of text.split("\n")) {
		if (max === undefined || max <= 0) {
			lines.push(shapeRun(font, para, scale));
			continue;
		}
		let cur = "";
		for (const word of para.split(" ")) {
			const next = cur ? `${cur} ${word}` : word;
			if (shapeRun(font, next, scale).width <= max || !cur) {
				cur = next;
			} else {
				lines.push(shapeRun(font, cur, scale));
				cur = word;
			}
			while (shapeRun(font, cur, scale).width > max && [...cur].length > 1) {
				const chars = [...cur];
				let k = chars.length - 1;
				while (k > 1 && shapeRun(font, chars.slice(0, k).join(""), scale).width > max) k--;
				lines.push(shapeRun(font, chars.slice(0, k).join(""), scale));
				cur = chars.slice(k).join("");
			}
		}
		lines.push(shapeRun(font, cur, scale));
	}
	const content = (font.ascender - font.descender) * scale;
	const ascent = (lineHeight - content) / 2 + font.ascender * scale;
	return {
		lines,
		width: Math.max(0, ...lines.map((l) => l.width)),
		height: lines.length * lineHeight,
		size,
		lineHeight,
		ascent,
	};
}

/**
 * Builds the world-space path for a layout anchored at `(x, y)`. `align` positions each line
 * relative to `x`; `baseline` says which part of the whole block sits on `y`.
 */
export function textPath(
	font: Font,
	layout: TextLayout,
	x: number,
	y: number,
	align: TextAlign = "start",
	baseline: TextBaseline = "top",
): Path {
	const scale = layout.size / font.unitsPerEm;
	let top = y;
	if (baseline === "middle") top = y - layout.height / 2;
	else if (baseline === "bottom") top = y - layout.height;
	else if (baseline === "alphabetic") top = y - layout.ascent;
	const path = new Path();
	layout.lines.forEach((line, i) => {
		const lx = align === "center" ? x - line.width / 2 : align === "end" ? x - line.width : x;
		const by = top + i * layout.lineHeight + layout.ascent;
		for (const g of line.glyphs) {
			const gp = font.glyphPath(g.glyph);
			if (!gp.empty) path.addPath(gp, scale, -scale, lx + g.x, by);
		}
	});
	return path;
}
