/**
 * @module
 * A Deno-native, dependency-free Hunspell-compatible spell checker for BearMetal.
 */

export { SpellChecker } from "./checker.ts";
export {
	DictionaryNotFoundError,
	LanguageLoadFailedError,
	LanguagePendingError,
	UnknownLanguageError,
} from "./errors.ts";

export type * from "./types.ts";
