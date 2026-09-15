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
 * Checks a word against a loaded lookup set, falling back to a per-segment hyphenation check on a
 * miss. A hyphenated word is correct only if every non-empty segment independently checks out; a
 * leading/trailing/double hyphen (producing an empty segment) fails the whole word.
 */
function checkAgainstLookup(word: string, lookup: Set<string>): boolean {
	if (lookup.has(word)) return true;
	if (!word.includes("-")) return false;

	const segments = word.split("-");
	if (segments.some((segment) => segment.length === 0)) return false;
	return segments.every((segment) => checkAgainstLookup(segment, lookup));
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
		return checkAgainstLookup(word, entry.lookup!);
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
