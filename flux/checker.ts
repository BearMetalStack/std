/**
 * @module
 * `SpellChecker` — boolean correctness checking against loaded Hunspell dictionary pairs.
 */

import { parseAff } from "./aff.ts";
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
	if (lookup.has(word)) return { correct: true };
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
			.then((lookup) => {
				entry.status = "ready";
				entry.lookup = lookup;
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
		return checkAgainstLookup(word, entry.lookup!).correct;
	}

	forLanguage(lang: string): LanguageChecker {
		return { check: (word: string) => this.check(lang, word) };
	}

	async #parse(paths: DictionaryPaths): Promise<Set<string>> {
		const affText = await readDictionaryFile(paths.aff);
		const { suffixes, prefixes, flagMode } = parseAff(affText, { debug: this.#debug });
		const dicText = await readDictionaryFile(paths.dic);
		return parseDic(dicText, { suffixes, prefixes, flagMode });
	}
}
