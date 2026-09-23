import { assertEquals } from "@std/assert";
import {
	compareStrings,
	damerauLevenshteinDistance,
	levenshteinDistance,
	stringsSufficientlySimilar,
} from "./compare.ts";

Deno.test("levenshteinDistance: classic cases", () => {
	assertEquals(levenshteinDistance("", ""), 0);
	assertEquals(levenshteinDistance("", "abc"), 3);
	assertEquals(levenshteinDistance("abc", ""), 3);
	assertEquals(levenshteinDistance("kitten", "sitting"), 3);
	assertEquals(levenshteinDistance("flaw", "lawn"), 2);
	assertEquals(levenshteinDistance("nmae", "name"), 2);
});

Deno.test("damerauLevenshteinDistance: an adjacent transposition is one edit", () => {
	assertEquals(damerauLevenshteinDistance("nmae", "name"), 1);
	assertEquals(damerauLevenshteinDistance("teh", "the"), 1);
	assertEquals(damerauLevenshteinDistance("ab", "ba"), 1);
	assertEquals(damerauLevenshteinDistance("kitten", "sitting"), 3);
	assertEquals(damerauLevenshteinDistance("abcdef", "badcfe"), 3);
});

Deno.test("damerauLevenshteinDistance: optimal string alignment never re-edits a transposed pair", () => {
	assertEquals(damerauLevenshteinDistance("ca", "abc"), 3);
});

Deno.test("edit distance counts code points, not UTF-16 units", () => {
	assertEquals(levenshteinDistance("😀", "😃"), 1);
	assertEquals(levenshteinDistance("a😀", "a"), 1);
	assertEquals(damerauLevenshteinDistance("😀😃", "😃😀"), 1);
	assertEquals(damerauLevenshteinDistance("𝒳y", "y𝒳"), 1);
});

Deno.test("edit distance accepts pre-split units, e.g. grapheme clusters", () => {
	const graphemes = (s: string) =>
		Array.from(new Intl.Segmenter().segment(s), ({ segment }) => segment);
	const combining = "café";
	const precomposed = "café";
	assertEquals(levenshteinDistance(combining, "cafe"), 1);
	assertEquals(levenshteinDistance(graphemes(combining), graphemes("cafx")), 1);
	assertEquals(levenshteinDistance(graphemes("👨‍👩‍👧x"), graphemes("x👨‍👩‍👧")), 2);
	assertEquals(damerauLevenshteinDistance(graphemes("👨‍👩‍👧x"), graphemes("x👨‍👩‍👧")), 1);
	assertEquals(levenshteinDistance(precomposed.normalize("NFD"), combining), 0);
});

Deno.test("maxDistance returns maxDistance + 1 once the bound is exceeded", () => {
	assertEquals(damerauLevenshteinDistance("kitten", "sitting", { maxDistance: 1 }), 2);
	assertEquals(damerauLevenshteinDistance("a", "abcdefg", { maxDistance: 2 }), 3);
	assertEquals(damerauLevenshteinDistance("teh", "the", { maxDistance: 1 }), 1);
	assertEquals(levenshteinDistance("kitten", "sitting", { maxDistance: 3 }), 3);
	assertEquals(levenshteinDistance("kitten", "sitting", { maxDistance: 0 }), 1);
});

Deno.test("maxDistance never changes an answer within the bound", () => {
	const words = ["", "a", "ab", "ba", "abc", "acb", "cab", "abcd", "badc", "kitten", "sitting"];
	for (const a of words) {
		for (const b of words) {
			const full = damerauLevenshteinDistance(a, b);
			for (let max = 0; max <= 7; max++) {
				const bounded = damerauLevenshteinDistance(a, b, { maxDistance: max });
				assertEquals(bounded, full <= max ? full : max + 1, `${a} → ${b} @ ${max}`);
			}
		}
	}
});

Deno.test("compareStrings is case-insensitive Damerau–Levenshtein", () => {
	assertEquals(compareStrings("NMAE", "name"), 1);
	assertEquals(stringsSufficientlySimilar("Teh", "the", 1), true);
	assertEquals(stringsSufficientlySimilar("kitten", "sitting", 2), false);
});

/** Textbook optimal string alignment, with no band or early exit, as a reference. */
function referenceOsa(a: string[], b: string[]): number {
	const d = Array.from(
		{ length: a.length + 1 },
		(_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			d[i][j] = Math.min(
				d[i - 1][j] + 1,
				d[i][j - 1] + 1,
				d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[a.length][b.length];
}

Deno.test("damerauLevenshteinDistance agrees with a reference implementation, bounded or not", () => {
	let seed = 42;
	const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	const word = () =>
		Array.from({ length: Math.floor(random() * 9) }, () => "abc😀"[Math.floor(random() * 4)]);
	for (let n = 0; n < 2000; n++) {
		const a = word();
		const b = word();
		const expected = referenceOsa(a, b);
		assertEquals(damerauLevenshteinDistance(a.join(""), b.join("")), expected);
		const max = Math.floor(random() * 5);
		assertEquals(
			damerauLevenshteinDistance(a, b, { maxDistance: max }),
			expected <= max ? expected : max + 1,
			`${a.join("")} → ${b.join("")} @ ${max}`,
		);
	}
});
