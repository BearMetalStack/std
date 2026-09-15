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
}

/** Options accepted by the {@linkcode SpellChecker} constructor. */
export interface SpellCheckerOptions {
	/** When true, unhandled `.aff` directives are announced via `console.warn`. */
	debug?: boolean;
}
