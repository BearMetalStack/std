/**
 * @module
 * Public types for @bearmetal/flux
 */

/** File paths for a Hunspell-compatible `.aff`/`.dic` dictionary pair. */
export interface DictionaryPaths {
	aff: string;
	dic: string;
}

/** Sugar interface returned by {@linkcode SpellChecker.forLanguage}. */
export interface LanguageChecker {
	check(word: string): boolean;
	suggest(word: string, options?: SuggestOptions): string[];
	checkAndSuggest(word: string, options?: SuggestOptions): CheckAndSuggestResult;
}

/** Options accepted by {@linkcode SpellChecker.suggest} and {@linkcode SpellChecker.checkAndSuggest}. */
export interface SuggestOptions {
	/** Most suggestions to return. Defaults to 8. */
	limit?: number;
	/**
	 * Furthest (Damerau–Levenshtein) edit distance a suggestion found by scanning the dictionary may
	 * be from the word. Defaults to 1 for words of three characters or fewer and 2 otherwise — two
	 * edits to a short word usually makes a different word, not a typo of it. Candidates from the
	 * `.aff`'s `REP` table aren't bound by it, since a replacement like `shun` → `tion` is a common
	 * misspelling however many edits it takes.
	 */
	maxDistance?: number;
}

/**
 * The result of {@linkcode SpellChecker.checkAndSuggest}. A correct word carries no suggestions;
 * `suggestions` is always present so it can be read without narrowing first.
 */
export type CheckAndSuggestResult =
	| { correct: true; suggestions: [] }
	| { correct: false; suggestions: string[] };

/** Options accepted by the {@linkcode SpellChecker} constructor. */
export interface SpellCheckerOptions {
	/** When true, unhandled `.aff` directives are announced via `console.warn`. */
	debug?: boolean;
}
