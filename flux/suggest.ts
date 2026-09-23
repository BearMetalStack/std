/**
 * @module
 * Suggestion ("did you mean") generation against a loaded lookup set.
 *
 * Cheap, targeted candidates come first — a capitalization fix, the `.aff`'s `REP` table, every
 * single edit of the word, a split into two words — each checked by `Set` membership. Only when
 * those come up short does it fall back to scanning the whole lookup set by edit distance, which is
 * the one step that costs time proportional to the dictionary.
 */

import { compareStrings, damerauLevenshteinDistance } from "@bearmetal/miscellanea";
import type { RepRule } from "./aff.ts";
import type { SuggestOptions } from "./types.ts";

/** Everything {@linkcode suggestFromLookup} needs from a loaded language. */
export interface SuggestionSource {
	lookup: Set<string>;
	/** Characters tried for substitutions and insertions, most likely first. */
	alphabet: string[];
	rep: RepRule[];
	/** Whether a word (a hyphen-separated segment, when splitting) is already correct. */
	isCorrect(word: string): boolean;
}

const DEFAULT_LIMIT = 8;

// ─── Scores ─────────────────────────────────────────────────────────────────
// Lower ranks first. A plain edit-distance candidate scores its distance. Among single edits,
// swapped and dropped letters are the typos people actually make most, so they rank ahead of a
// wrong or extra letter.

const CASE_ONLY = 0;
const REP_MATCH = 0.5;
const TRANSPOSED = 0.8;
const MISSING_LETTER = 0.9;
const SINGLE_EDIT = 1;
const TWO_WORDS = 1.5;
/** A split into two words is only offered when both halves are at least this long. */
const MIN_SPLIT_PART = 2;

type Casing = "lower" | "initial" | "upper" | "mixed";

function casingOf(word: string): Casing {
	const lower = word.toLowerCase();
	if (word === lower) return "lower";
	if (word === word.toUpperCase()) return "upper";
	const [, ...rest] = word;
	const [, ...lowerRest] = lower;
	return rest.join("") === lowerRest.join("") ? "initial" : "mixed";
}

function capitalize(word: string): string {
	const [first = "", ...rest] = word;
	return first.toUpperCase() + rest.join("");
}

/** Carries the input's capitalization over to a suggestion the dictionary stores lowercase. */
function recase(suggestion: string, casing: Casing): string {
	if (casing === "upper") return suggestion.toUpperCase();
	if (casing === "initial" && suggestion === suggestion.toLowerCase()) {
		return capitalize(suggestion);
	}
	return suggestion;
}

/**
 * Every string one edit away from `chars`, with its score: each adjacent transposition, insertion,
 * substitution and deletion, with inserted and substituted characters drawn from `alphabet`.
 */
function* singleEdits(chars: string[], alphabet: string[]): Generator<[string, number]> {
	const n = chars.length;
	const at = (i: number) => chars.slice(0, i).join("");
	const from = (i: number) => chars.slice(i).join("");

	for (let i = 0; i < n - 1; i++) {
		if (chars[i] !== chars[i + 1]) {
			yield [at(i) + chars[i + 1] + chars[i] + from(i + 2), TRANSPOSED];
		}
	}
	for (let i = 0; i <= n; i++) {
		for (const c of alphabet) yield [at(i) + c + from(i), MISSING_LETTER];
	}
	for (let i = 0; i < n; i++) {
		for (const c of alphabet) if (c !== chars[i]) yield [at(i) + c + from(i + 1), SINGLE_EDIT];
	}
	for (let i = 0; i < n; i++) yield [at(i) + from(i + 1), SINGLE_EDIT];
}

interface LengthBucket {
	lower: string[][];
	original: string[];
	masks: number[];
}

/**
 * Which characters a word contains, hashed into 32 bits. A single edit changes at most two bits, so
 * two words whose masks differ in more than `2 × maxDistance` bits can't be within `maxDistance` —
 * a check that rules out nearly the whole dictionary before any edit distance is computed.
 */
function characterMask(chars: string[]): number {
	let mask = 0;
	for (const c of chars) mask |= 1 << (c.codePointAt(0)! & 31);
	return mask;
}

function popcount(x: number): number {
	x -= (x >>> 1) & 0x55555555;
	x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
	return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

const lengthIndexes = new WeakMap<Set<string>, Map<number, LengthBucket>>();

/**
 * The lookup set bucketed by length in code points, each entry pre-split, lowercased and masked, so
 * the edit-distance scan only visits words that could possibly be close enough. Built on first use and
 * kept for as long as the lookup set is.
 */
function lengthIndex(lookup: Set<string>): Map<number, LengthBucket> {
	let index = lengthIndexes.get(lookup);
	if (index) return index;
	index = new Map();
	for (const entry of lookup) {
		const lower = Array.from(entry.toLowerCase());
		let bucket = index.get(lower.length);
		if (!bucket) index.set(lower.length, bucket = { lower: [], original: [], masks: [] });
		bucket.lower.push(lower);
		bucket.original.push(entry);
		bucket.masks.push(characterMask(lower));
	}
	lengthIndexes.set(lookup, index);
	return index;
}

function* repCandidates(word: string, rules: RepRule[]): Generator<string> {
	for (const { from, to, anchorStart, anchorEnd } of rules) {
		for (let i = word.indexOf(from); i !== -1; i = word.indexOf(from, i + 1)) {
			if (anchorStart && i !== 0) break;
			if (anchorEnd && i + from.length !== word.length) continue;
			yield word.slice(0, i) + to + word.slice(i + from.length);
		}
	}
}

function commonPrefixLength(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return i;
}

/**
 * Suggests corrections for `word`, best first, never including `word` itself. `word` is taken as
 * typed — it doesn't have to be misspelled, so this also answers "what else could this have been".
 */
export function suggestFromLookup(
	word: string,
	source: SuggestionSource,
	options: SuggestOptions = {},
): string[] {
	const limit = options.limit ?? DEFAULT_LIMIT;
	if (limit <= 0 || word.length === 0) return [];

	const { lookup, alphabet, rep } = source;
	const casing = casingOf(word);
	const base = casing === "initial" || casing === "upper" ? word.toLowerCase() : word;
	const chars = Array.from(base);
	const maxDistance = options.maxDistance ?? (chars.length <= 3 ? 1 : 2);

	const found = new Map<string, number>();
	const offer = (candidate: string, score: number) => {
		if (candidate === word || candidate.length === 0) return;
		const previous = found.get(candidate);
		if (previous === undefined || score < previous) found.set(candidate, score);
	};

	/** The form `candidate` is stored under, if any — a lowercase typo of a proper noun included. */
	const resolve = (candidate: string): string | undefined => {
		if (lookup.has(candidate)) return candidate;
		if (casing === "lower") {
			const title = capitalize(candidate);
			if (lookup.has(title)) return title;
		}
		return undefined;
	};
	const resolvePhrase = (phrase: string): string | undefined => {
		const parts = phrase.split(" ").map(resolve);
		return parts.every((p) => p !== undefined) ? parts.join(" ") : undefined;
	};

	for (const variant of [word.toLowerCase(), capitalize(word.toLowerCase()), word.toUpperCase()]) {
		if (lookup.has(variant)) offer(variant, CASE_ONLY);
	}

	for (const candidate of repCandidates(base, rep)) {
		const match = resolvePhrase(candidate);
		if (match) offer(recase(match, casing), REP_MATCH);
	}

	for (const [candidate, score] of singleEdits(chars, alphabet)) {
		const match = resolve(candidate);
		if (match) offer(recase(match, casing), score);
	}

	for (let i = MIN_SPLIT_PART; i <= chars.length - MIN_SPLIT_PART; i++) {
		const match = resolvePhrase(chars.slice(0, i).join("") + " " + chars.slice(i).join(""));
		if (match) offer(recase(match, casing), TWO_WORDS);
	}

	const segments = word.split("-");
	if (segments.filter((s) => s.length > 0).length > 1) {
		let worst = 0;
		const fixed = segments.map((segment) => {
			if (segment.length === 0 || source.isCorrect(segment)) return segment;
			const [best] = suggestFromLookup(segment, source, { ...options, limit: 1 });
			if (best === undefined) return undefined;
			worst = Math.max(worst, compareStrings(segment, best));
			return best;
		});
		if (fixed.every((s) => s !== undefined)) offer(fixed.join("-"), worst);
	}

	if (found.size < limit) {
		const index = lengthIndex(lookup);
		const lowerChars = Array.from(base.toLowerCase());
		const mask = characterMask(lowerChars);
		const maxMaskDifference = 2 * maxDistance;
		for (
			let length = lowerChars.length - maxDistance;
			length <= lowerChars.length + maxDistance;
			length++
		) {
			const bucket = index.get(length);
			if (!bucket) continue;
			for (let i = 0; i < bucket.original.length; i++) {
				if (popcount(mask ^ bucket.masks[i]) > maxMaskDifference) continue;
				const distance = damerauLevenshteinDistance(lowerChars, bucket.lower[i], { maxDistance });
				if (distance <= maxDistance) offer(recase(bucket.original[i], casing), distance);
			}
		}
	}

	return [...found.entries()]
		.map(([suggestion, score], order) => ({
			suggestion,
			score,
			order,
			prefix: commonPrefixLength(
				word.toLowerCase(),
				word.includes(" ")
					? suggestion.toLowerCase()
					: suggestion.toLowerCase().replaceAll(" ", ""),
			),
			lengthGap: Math.abs(suggestion.length - word.length),
		}))
		.sort((a, b) =>
			a.score - b.score || b.prefix - a.prefix || a.lengthGap - b.lengthGap || a.order - b.order
		)
		.slice(0, limit)
		.map(({ suggestion }) => suggestion);
}

/**
 * The substitution/insertion alphabet for a language: the `.aff`'s `TRY` characters when it has
 * them (they're ordered by frequency), otherwise every character the dictionary uses, most common
 * first.
 */
export function suggestionAlphabet(tryChars: string | undefined, lookup: Set<string>): string[] {
	if (tryChars) return [...new Set(tryChars)];
	const counts = new Map<string, number>();
	for (const entry of lookup) {
		for (const c of entry.toLowerCase()) counts.set(c, (counts.get(c) ?? 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
