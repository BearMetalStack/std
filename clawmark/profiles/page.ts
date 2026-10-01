/**
 * @module
 * Page setup shared by the office writers: a {@linkcode PageSetup} resolved to
 * points once, so docx (twips) and odt (`fo:` lengths) cannot disagree.
 */

import { parseLength, toPoints } from "../format.ts";
import type { PageSetup, PaperSize } from "../types.ts";

/** Paper sizes in points, portrait. */
const PAPER: Record<PaperSize, [number, number]> = {
	letter: [612, 792],
	legal: [612, 1008],
	a4: [595.28, 841.89],
	a5: [419.53, 595.28],
};

/** A {@linkcode PageSetup} in points; absent fields were not given. */
export interface ResolvedPage {
	size?: { width: number; height: number; landscape: boolean };
	margins?: { top?: number; right?: number; bottom?: number; left?: number };
	font?: { family?: string; size?: number };
}

const pt = (value: string | undefined) => toPoints(parseLength(value), 12);

export function resolvePage(page: PageSetup | undefined, warn: (m: string) => void): ResolvedPage {
	if (!page) return {};
	const out: ResolvedPage = {};

	if (page.size || page.orientation) {
		let width: number | undefined;
		let height: number | undefined;
		const size = page.size ?? "letter";
		if (typeof size === "string") {
			const paper = PAPER[size];
			if (!paper) warn(`page: unknown paper size "${size}"`);
			else [width, height] = paper;
		} else {
			width = pt(size.width);
			height = pt(size.height);
			if (width === undefined || height === undefined) {
				warn(`page: could not read size ${JSON.stringify(size)}`);
			}
		}
		if (width !== undefined && height !== undefined) {
			const landscape = page.orientation === "landscape";
			const [short, long] = width < height ? [width, height] : [height, width];
			out.size = landscape
				? { width: long, height: short, landscape }
				: { width: short, height: long, landscape };
		}
	}

	if (typeof page.margins === "string" && pt(page.margins) === undefined) {
		warn(`page: could not read margins "${page.margins}"`);
	} else if (page.margins !== undefined) {
		const sides = typeof page.margins === "string"
			? { top: page.margins, right: page.margins, bottom: page.margins, left: page.margins }
			: page.margins;
		out.margins = {};
		for (const side of ["top", "right", "bottom", "left"] as const) {
			if (sides[side] === undefined) continue;
			const value = pt(sides[side]);
			if (value === undefined) warn(`page: could not read margin ${side} "${sides[side]}"`);
			else out.margins[side] = value;
		}
	}

	if (page.font) {
		out.font = {};
		if (page.font.family) out.font.family = page.font.family;
		if (page.font.size !== undefined) {
			const size = pt(page.font.size);
			if (size === undefined) warn(`page: could not read font size "${page.font.size}"`);
			else out.font.size = size;
		}
	}

	return out;
}

/** Trims float noise for output. */
export function roundPt(value: number): number {
	return Math.round(value * 100) / 100;
}
