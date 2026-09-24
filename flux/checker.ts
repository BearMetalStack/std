/**
 * @module
 * `SpellChecker` — boolean correctness checking against loaded Hunspell dictionary pairs.
 */

import { applyIconv, type IconvRule, parseAff, type RepRule } from "./aff.ts";
import { parseDic } from "./dic.ts";
import {
	DictionaryNotFoundError,
	LanguageLoadFailedError,
	LanguagePendingError,
	UnknownLanguageError,
} from "./errors.ts";
import { suggestFromLookup, suggestionAlphabet, type SuggestionSource } from "./suggest.ts";
import type {
	CheckAndSuggestResult,
	DictionaryPaths,
	LanguageChecker,
	SpellCheckerOptions,
	SuggestOptions,
} from "./types.ts";

interface LanguageEntry {
	/** Rejects with the raw underlying cause, never a `LanguageLoadFailedError`. */
	promise: Promise<void>;
	status: "pending" | "ready" | "failed";
	lookup?: Set<string>;
	/** The `.aff`'s `ICONV` table, applied to a word before it's checked against `lookup`. */
	iconv?: IconvRule[];
	rep?: RepRule[];
	/** The `.aff`'s `TRY` directive, turned into a suggestion alphabet the first time it's needed. */
	tryChars?: string;
	suggestions?: SuggestionSource;
	loadError?: LanguageLoadFailedError;
}

interface ReadyLanguageEntry extends LanguageEntry {
	status: "ready";
	lookup: Set<string>;
	iconv: IconvRule[];
	rep: RepRule[];
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
			.then(({ lookup, iconv, rep, tryChars }) => {
				entry.status = "ready";
				entry.lookup = lookup;
				entry.iconv = iconv;
				entry.rep = rep;
				entry.tryChars = tryChars;
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

	/** Whether `word` is spelled correctly in `lang`. */
	check(lang: string, word: string): boolean {
		const entry = this.#readyEntry(lang);
		return checkAgainstLookup(applyIconv(word, entry.iconv), entry.lookup).correct;
	}

	/**
	 * Suggested spellings for `word` in `lang`, best first. `word` doesn't have to be misspelled —
	 * a correct word gets its nearest neighbours — and is never among its own suggestions. Throws
	 * in the same states {@linkcode check} does.
	 */
	suggest(lang: string, word: string, options?: SuggestOptions): string[] {
		const entry = this.#readyEntry(lang);
		return suggestFromLookup(applyIconv(word, entry.iconv), this.#suggestionSource(entry), options);
	}

	/** {@linkcode check}, followed by {@linkcode suggest} only when the word is misspelled. */
	checkAndSuggest(lang: string, word: string, options?: SuggestOptions): CheckAndSuggestResult {
		const entry = this.#readyEntry(lang);
		const converted = applyIconv(word, entry.iconv);
		if (checkAgainstLookup(converted, entry.lookup).correct) {
			return { correct: true, suggestions: [] };
		}
		const suggestions = suggestFromLookup(converted, this.#suggestionSource(entry), options);
		return { correct: false, suggestions };
	}

	forLanguage(lang: string): LanguageChecker {
		return {
			check: (word) => this.check(lang, word),
			suggest: (word, options) => this.suggest(lang, word, options),
			checkAndSuggest: (word, options) => this.checkAndSuggest(lang, word, options),
		};
	}

	#readyEntry(lang: string): ReadyLanguageEntry {
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
		return entry as ReadyLanguageEntry;
	}

	#suggestionSource(entry: ReadyLanguageEntry): SuggestionSource {
		return entry.suggestions ??= {
			lookup: entry.lookup,
			alphabet: suggestionAlphabet(entry.tryChars, entry.lookup),
			rep: entry.rep,
			isCorrect: (word) => checkAgainstLookup(word, entry.lookup).correct,
		};
	}

	async #parse(paths: DictionaryPaths) {
		const affText = await readDictionaryFile(paths.aff);
		const { suffixes, prefixes, flagMode, iconv, rep, directives } = parseAff(affText, {
			debug: this.#debug,
		});
		const dicText = await readDictionaryFile(paths.dic);
		const lookup = parseDic(dicText, { suffixes, prefixes, flagMode });
		return { lookup, iconv, rep, tryChars: directives.get("TRY") };
	}
}
