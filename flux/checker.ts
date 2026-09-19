/**
 * @module
 * `SpellChecker` — boolean correctness checking against loaded Hunspell dictionary pairs.
 */

import { applyIconv, type IconvRule, parseAff } from "./aff.ts";
import { parseDic } from "./dic.ts";
import {
	DictionaryNotFoundError,
	LanguageLoadFailedError,
	LanguagePendingError,
	UnknownLanguageError,
} from "./errors.ts";
import type { DictionaryPaths, LanguageChecker, SpellCheckerOptions } from "./types.ts";

interface LanguageEntry {
	/** Rejects with the raw underlying cause, never a `LanguageLoadFailedError`. */
	promise: Promise<void>;
	status: "pending" | "ready" | "failed";
	lookup?: Set<string>;
	/** The `.aff`'s `ICONV` table, applied to a word before it's checked against `lookup`. */
	iconv?: IconvRule[];
	loadError?: LanguageLoadFailedError;
}

async function readDictionaryFile(path: string): Promise<string> {
	try {
		return await Deno.readTextFile(path);
	} catch (cause) {
		if (cause instanceof Deno.errors.NotFound) {
			throw new DictionaryNotFoundError(`Dictionary file not found: ${path}`, { cause });
		}
		throw cause;
	}
}

/**
 * The result of checking a word (or a segment of one). `at` names the `[start, end)` substring
 * ranges — into the original word passed to {@linkcode checkAgainstLookup} — of the segments that
 * failed, so a caller can point at exactly what's wrong rather than just "whole word bad".
 */
export interface SpellCheckResult {
	correct: boolean;
	at?: [number, number][];
}

/**
 * A dictionary word list is built from lowercase stems, so an exact-case lookup alone rejects
 * every common word the moment it's capitalized (sentence-initial, a heading, ...). Hunspell
 * handles this by re-checking a lowercased form; this mirrors that for the two cases a flat
 * `Set<string>` can support without per-word provenance (see ROADMAP.md): a word that's *only*
 * its first letter capitalized (`Her` → `her`), and a fully capitalized word, which also gets a
 * titlecase retry (`NASA`-style acronyms aside, `THE` → `the` and `MCDONALD` → `Mcdonald` both
 * still need a shot). An all-lowercase word was already checked as-is, so it takes neither path.
 */
function capitalizationVariantMatches(word: string, lookup: Set<string>): boolean {
	const first = word.charAt(0);
	const rest = word.slice(1);
	const isInitCap = first === first.toUpperCase() && first !== first.toLowerCase() &&
		rest === rest.toLowerCase();
	const isAllCap = word === word.toUpperCase() && word !== word.toLowerCase();

	if (!isInitCap && !isAllCap) return false; // all-lowercase, or mixed beyond a plain initial cap

	const lower = word.toLowerCase();
	if (lookup.has(lower)) return true;
	if (!isAllCap) return false;

	const title = lower.charAt(0).toUpperCase() + lower.slice(1);
	return lookup.has(title);
}

/**
 * Checks a word against a loaded lookup set, falling back to a per-segment hyphenation check on a
 * miss. A hyphenated word is correct if every *non-empty* segment independently checks out —
 * leading/trailing/double hyphens produce empty segments, which are skipped rather than failing
 * the whole word (treating them as failures produced false positives on ordinary formatting noise
 * the caller would otherwise have to filter out manually). `offset` locates `word` within the
 * original input for `at` reporting; callers checking a whole word on its own can omit it.
 */
export function checkAgainstLookup(
	word: string,
	lookup: Set<string>,
	offset = 0,
): SpellCheckResult {
	if (lookup.has(word) || capitalizationVariantMatches(word, lookup)) return { correct: true };
	if (!word.includes("-")) {
		return { correct: false, at: [[offset, offset + word.length]] };
	}

	const segments = word.split("-");
	const failures: [number, number][] = [];
	let cursor = offset;
	for (const segment of segments) {
		if (segment.length > 0) {
			const result = checkAgainstLookup(segment, lookup, cursor);
			if (result.at) failures.push(...result.at);
		}
		cursor += segment.length + 1; // +1 for the hyphen consumed by split()
	}
	return failures.length === 0 ? { correct: true } : { correct: false, at: failures };
}

export class SpellChecker {
	#languages = new Map<string, LanguageEntry>();
	#allLoadPromises: Promise<unknown>[] = [];
	#debug: boolean;

	constructor(options: SpellCheckerOptions = {}) {
		this.#debug = options.debug ?? false;
	}

	get ready(): Promise<void> {
		return Promise.allSettled(this.#allLoadPromises).then(() => undefined);
	}

	loadLanguage(lang: string, paths: DictionaryPaths): Promise<void> {
		const entry = { status: "pending" } as LanguageEntry;

		const promise = this.#parse(paths)
			.then(({ lookup, iconv }) => {
				entry.status = "ready";
				entry.lookup = lookup;
				entry.iconv = iconv;
			})
			.catch((cause) => {
				entry.status = "failed";
				entry.loadError = new LanguageLoadFailedError(
					`Failed to load language "${lang}"`,
					{ cause },
				);
				throw cause;
			});

		entry.promise = promise;
		this.#languages.set(lang, entry);
		this.#allLoadPromises.push(promise);
		return promise;
	}

	langReady(lang: string): Promise<void> {
		const entry = this.#languages.get(lang);
		if (!entry) {
			throw new UnknownLanguageError(`"${lang}" was never registered via loadLanguage.`);
		}
		return entry.promise;
	}

	check(lang: string, word: string): boolean {
		const entry = this.#languages.get(lang);
		if (!entry) {
			throw new UnknownLanguageError(`"${lang}" was never registered via loadLanguage.`);
		}
		if (entry.status === "pending") {
			throw new LanguagePendingError(
				`"${lang}" is still loading — await \`ready\` or \`langReady(lang)\` first.`,
			);
		}
		if (entry.status === "failed") {
			throw entry.loadError!;
		}
		const converted = applyIconv(word, entry.iconv!);
		return checkAgainstLookup(converted, entry.lookup!).correct;
	}

	forLanguage(lang: string): LanguageChecker {
		return { check: (word: string) => this.check(lang, word) };
	}

	async #parse(paths: DictionaryPaths): Promise<{ lookup: Set<string>; iconv: IconvRule[] }> {
		const affText = await readDictionaryFile(paths.aff);
		const { suffixes, prefixes, flagMode, iconv } = parseAff(affText, { debug: this.#debug });
		const dicText = await readDictionaryFile(paths.dic);
		const lookup = parseDic(dicText, { suffixes, prefixes, flagMode });
		return { lookup, iconv };
	}
}
