/**
 * @module
 * Error types thrown by @bearmetal/flux.
 */

/** Thrown by `check()`/`langReady()` when `loadLanguage` was never called for the given tag. */
export class UnknownLanguageError extends Error {
	override readonly name = "UnknownLanguageError";
}

/** Thrown by `check()` when `loadLanguage` was called but hasn't settled yet. */
export class LanguagePendingError extends Error {
	override readonly name = "LanguagePendingError";
}

/**
 * Thrown by `check()` when `loadLanguage` was called, settled, and failed.
 * `.cause` holds the underlying error (e.g. `DictionaryNotFoundError` or a parse failure).
 */
export class LanguageLoadFailedError extends Error {
	override readonly name = "LanguageLoadFailedError";
}

/** Thrown/used as a rejection cause when a dictionary path was given but the file is missing. */
export class DictionaryNotFoundError extends Error {
	override readonly name = "DictionaryNotFoundError";
}
