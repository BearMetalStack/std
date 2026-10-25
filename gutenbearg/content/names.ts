/**
 * The file-name grammar that stands in for a manifest: `0016-[rocket]-start-here.md`.
 *
 * The number orders siblings and never reaches a URL. Numbers are spaced by {@linkcode STEP} so a
 * page can be inserted between two others by halving the gap, without renaming anything; when a
 * gap runs out, {@linkcode respace} spreads a directory back out.
 */

/** The gap left between a new entry and the one before it. */
export const STEP = 16;
/** Digits in a number prefix. */
export const WIDTH = 4;

const NUMBERED = /^(\d{4})-(?:\[([a-z0-9-]+)\]-)?(.+?)(\.md)?$/;
const UNNUMBERED = /^(?:\[([a-z0-9-]+)\]-)?(.+?)(\.md)?$/;

/** A file or directory name, taken apart. */
export interface ParsedName {
	/** Sort key; `Infinity` when the name has no number. */
	order: number;
	numbered: boolean;
	icon?: string;
	slug: string;
}

/** Splits a name into its order, optional icon and slug. */
export function parseName(name: string): ParsedName {
	const n = NUMBERED.exec(name);
	if (n) return { order: Number(n[1]), numbered: true, icon: n[2], slug: n[3] };
	const u = UNNUMBERED.exec(name)!;
	return { order: Infinity, numbered: false, icon: u[1], slug: u[2] };
}

/** Builds a name from its parts — the inverse of {@linkcode parseName}. */
export function formatName(
	order: number,
	slug: string,
	options: { icon?: string; ext?: string } = {},
): string {
	const icon = options.icon ? `[${options.icon}]-` : "";
	return `${String(order).padStart(WIDTH, "0")}-${icon}${slug}${options.ext ?? ""}`;
}

/** Orders parsed names: by number, then unnumbered names alphabetically after them. */
export function compareNames(a: ParsedName, b: ParsedName): number {
	return a.order - b.order || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/** The number for a new entry after `last` (or the first, `0`). */
export function nextNumber(last?: number): number {
	return last === undefined ? 0 : last + STEP;
}

/**
 * The number halfway between two neighbours, or `null` when they are adjacent and there is no
 * room left — the cue to {@linkcode respace}. With no `after`, inserts before `before` by halving
 * down toward zero.
 */
export function between(before: number | undefined, after: number | undefined): number | null {
	if (before === undefined && after === undefined) return 0;
	if (after === undefined) return nextNumber(before);
	const low = before ?? -1;
	const mid = Math.floor((low + after) / 2);
	return mid > low && mid < after ? mid : null;
}

/** New numbers for `count` entries in order, spaced by `step` from zero. */
export function respace(count: number, step = STEP): number[] {
	return Array.from({ length: count }, (_, i) => i * step);
}

/** `start-here` → `Start here`. */
export function titleize(slug: string): string {
	const words = slug.replace(/[-_]+/g, " ").trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}
