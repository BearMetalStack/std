import type { EditDistanceInput, EditDistanceOptions } from "@types";

export function stringsSufficientlySimilar(a: string, b: string, threshold: number): boolean {
	return compareStrings(a, b, { maxDistance: threshold }) <= threshold;
}

/**
 * Case-insensitive {@linkcode damerauLevenshteinDistance} — the distance a person would count when
 * judging whether one word is a typo of another.
 */
export function compareStrings(a: string, b: string, options?: EditDistanceOptions): number {
	return damerauLevenshteinDistance(a.toLowerCase(), b.toLowerCase(), options);
}

/**
 * Levenshtein distance: the fewest single-character insertions, deletions and substitutions that
 * turn `a` into `b`. Compared by code point, not UTF-16 unit.
 */
export function levenshteinDistance(
	a: EditDistanceInput,
	b: EditDistanceInput,
	options?: EditDistanceOptions,
): number {
	return editDistance(a, b, false, options?.maxDistance);
}

/**
 * Damerau–Levenshtein distance (optimal string alignment): Levenshtein plus transposition of two
 * adjacent characters as a single edit, so `nmae` → `name` costs 1 rather than 2. A transposed
 * pair can't be edited again afterwards — `ca` → `abc` is 3, not 2 — which is the restriction
 * spell checkers use and is what keeps this a simple table walk.
 */
export function damerauLevenshteinDistance(
	a: EditDistanceInput,
	b: EditDistanceInput,
	options?: EditDistanceOptions,
): number {
	return editDistance(a, b, true, options?.maxDistance);
}

function editDistance(
	aIn: EditDistanceInput,
	bIn: EditDistanceInput,
	transpositions: boolean,
	maxDistance = Infinity,
): number {
	const a = typeof aIn === "string" ? Array.from(aIn) : aIn;
	const b = typeof bIn === "string" ? Array.from(bIn) : bIn;
	const m = a.length;
	const n = b.length;
	const cap = maxDistance + 1;

	if (Math.abs(m - n) > maxDistance) return cap;
	if (m === 0) return n;
	if (n === 0) return m;

	// With a bound, only cells within `maxDistance` of the diagonal can still be in range; everything
	// outside that band reads as `cap`.
	let prev2 = new Array<number>(n + 1).fill(cap);
	let prev = Array.from({ length: n + 1 }, (_, j) => j);
	let curr = new Array<number>(n + 1).fill(cap);
	let prevMin = 0;

	for (let i = 1; i <= m; i++) {
		const lo = Math.max(1, i - maxDistance);
		const hi = Math.min(n, i + maxDistance);
		curr[0] = i;
		curr[lo - 1] = lo === 1 ? i : cap;
		let rowMin = cap;
		for (let j = lo; j <= hi; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let d = Math.min(prev[j - 1] + cost, prev[j] + 1, curr[j - 1] + 1);
			if (
				transpositions && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]
			) {
				d = Math.min(d, prev2[j - 2] + 1);
			}
			curr[j] = d;
			if (d < rowMin) rowMin = d;
		}
		if (hi < n) curr[hi + 1] = cap;
		// A transposition reads two rows back at +1, so this row's minimum alone isn't a floor for
		// every later row — the smaller of it and the previous row's minimum + 1 is.
		const floor = transpositions ? Math.min(rowMin, prevMin + 1) : rowMin;
		if (floor > maxDistance) return cap;
		prevMin = rowMin;
		[prev2, prev, curr] = [prev, curr, prev2];
	}

	return Math.min(prev[n], cap);
}
