# @bearmetal/flux — SPEC

## Purpose

A Deno-native, dependency-free Hunspell-compatible spell checker for BearMetal.
Reads standard Hunspell `.aff`/`.dic` dictionary pairs (e.g. sourced from the
LibreOffice dictionaries repo) and answers "is this word correct" for one or
more loaded languages.

This spec covers the first implementation milestone: **boolean correctness
checking only**. Suggestions (edit-distance ranking), text tokenization, and
compound-word support are explicitly out of scope — see ROADMAP.md.

## Non-goals (this milestone)

- Suggestion/"did you mean" ranking
- Full-text/tokenized document checking
- Compound word support (`COMPOUND*` affix directives)
- Any dictionary loading mechanism other than local file paths

## Public API

### `SpellChecker`

```ts
class SpellChecker {
  /**
   * Registers a language and begins parsing its dictionary pair.
   * Returns a promise that resolves when this specific language's
   * load settles (success), or rejects with the underlying cause
   * (failure). Calling this is what makes `langReady` and `check`
   * aware the language exists at all.
   */
  loadLanguage(lang: string, paths: { aff: string; dic: string }): Promise<void>;

  /**
   * Resolves once every `loadLanguage` call currently in flight has
   * settled, regardless of individual success/failure. Never rejects.
   * Re-arms (tracks new in-flight loads) if more languages are loaded
   * after a prior `ready` resolved.
   */
  readonly ready: Promise<void>;

  /**
   * Tracks a single language's load outcome.
   * - Resolves when that language's load succeeds.
   * - Rejects (with the underlying cause) when that language's load fails.
   * - Throws synchronously if `loadLanguage` was never called for this tag.
   *   This throw is the intended signal to call `loadLanguage` first.
   */
  langReady(lang: string): Promise<void>;

  /**
   * Synchronous correctness check for a single word against a loaded
   * language. Always synchronous — never awaits internally.
   *
   * Throws:
   * - `UnknownLanguageError` — `loadLanguage` was never called for `lang`.
   * - `LanguagePendingError` — `loadLanguage` was called but has not
   *   settled yet (caller forgot to await `ready`/`langReady`).
   * - `LanguageLoadFailedError` — `loadLanguage` was called, settled,
   *   and failed. `.cause` holds the underlying error
   *   (`DictionaryNotFoundError`, parse errors, etc).
   */
  check(lang: string, word: string): boolean;

  /**
   * Sugar over `check`, scoped to one language. Built entirely on top
   * of the explicit API above — no separate code path.
   */
  forLanguage(lang: string): { check(word: string): boolean };
}
```

### Error types

```ts
class UnknownLanguageError extends Error {}      // never loadLanguage'd
class LanguagePendingError extends Error {}      // loadLanguage'd, not settled
class LanguageLoadFailedError extends Error {}   // loadLanguage'd, settled, failed
class DictionaryNotFoundError extends Error {}   // path given but file missing
```

`LanguageLoadFailedError` wraps the originating error via the standard `cause`
field (e.g. a `DictionaryNotFoundError`, or a parse failure).

## Loading behavior

- `loadLanguage` accepts **file paths only** in this milestone (see ROADMAP
  for URLs/bytes/resolver-object support).
- Each call kicks off an independent parse of the `.aff` then the `.dic`.
- The same promise instance is shared between the return value of
  `loadLanguage` and whatever `langReady` returns for that language — there
  is one underlying settlement per language, observed two ways.
- `check()` never blocks. It inspects load state synchronously and either
  answers or throws one of the three states above.

## Hyphenation fallback

Since compounding is out of scope, hyphenated input gets a simple fallback:

1. Try the full string against the loaded dictionary's lookup set.
2. On miss, split on `-`.
3. If any resulting segment is an empty string (leading/trailing/double
   hyphen), the whole word fails — no filtering of empty segments.
4. Otherwise, every non-empty segment must individually pass `check()`
   (recursively, so nested logic like case folding still applies per
   segment). The word is correct only if all segments are.

Known limitation, accepted as-is: this will false-positive on hyphenated
idioms where each part is independently a valid word but the compound isn't
idiomatic (e.g. multi-word phrases). No phrase dictionary is planned to
address this.

## `.aff` parsing

Single-pass parser: walks the affix file once and builds the final lookup
tables directly — no intermediate AST (two-stage parse/build is a roadmap
item, not this milestone).

### Directive handling

- **Simple key-value directives** (`SET`, `FLAG`, `TRY`, `WORDCHARS`, `LANG`,
  `IGNORE`, etc.) — parsed and stored.
- **`FLAG` mode** — must be honored for all flag references in this file and
  the paired `.dic` file. Supports all three Hunspell flag styles:
  - default: single character
  - `long`: two-character pairs
  - `num`: comma-separated numbers
  All flags are normalized to a plain string key at parse time regardless of
  source format, so downstream code never needs to know which mode was used.
- **`COMPOUND*` and other unimplemented directives** — recognized (so
  parsing doesn't misalign on subsequent lines) but not acted on. When a
  debug flag is enabled, emit an inline warning (e.g. `console.warn`) naming
  the unhandled directive. No formal warnings-collection API in this
  milestone (see `getWarnings` in ROADMAP).
- **`SFX` / `PFX` blocks** — the core of the parser:
  - Header: `SFX <flag> <cross-product Y/N> <rule count>`
  - N rule lines: `SFX <flag> <strip> <add> <condition>`
    - `strip`: substring to remove from the stem, or `0` for none
    - `add`: substring to append (suffix) or prepend (prefix); a trailing
      `/<continuation-flags>` is parsed but continuation-flag application
      (recursive affixation) is a roadmap item, not this milestone
    - `condition`: Hunspell's condition mini-syntax (a strict subset of
      regex character classes) — **compiled to a real `RegExp` at parse
      time**, not interpreted at lookup time
  - Suffix conditions test against the end of the stem; prefix conditions
    test against the start.

### Target in-memory shape

```ts
interface AffixRule {
  strip: string | null; // null = "0"
  add: string;
  condition: RegExp;
}

interface AffixTable {
  crossProduct: boolean;
  rules: AffixRule[];
}

type Suffixes = Map<string, AffixTable>; // keyed by normalized flag
type Prefixes = Map<string, AffixTable>;
```

## `.dic` parsing + expansion

Also single-pass, feeding directly off the `Suffixes`/`Prefixes` tables built
from the paired `.aff` file.

For each line (after the leading word-count line, which is a hint only — not
trusted as an authoritative bound):

1. Split `word` from `flags` at the first **unescaped** `/`. `\/` in the word
   itself is an escaped literal slash, not a flag delimiter — handle this
   even though it's rare.
2. Ignore any morphological data trailing after a tab.
3. Normalize flags to string keys using the same `FLAG`-mode logic as the
   `.aff` parser.
4. Insert the stem itself into the lookup structure unconditionally.
5. For each flag on the word:
   - If it's a known suffix flag, apply every rule in that `AffixTable`
     whose `condition` matches the stem; insert each resulting form.
   - Same for prefix flags, matching/stripping/adding at the start.
6. **Cross-product expansion**: if a word carries both a prefix flag and a
   suffix flag and both flags' tables have `crossProduct: true`, generate
   the combined prefix+suffix forms as well (not just each independently).
   This is done **eagerly, at load time** (lazy/on-demand cross-product
   expansion is a roadmap item).

### Target lookup structure

`Set<string>` per loaded language, containing every valid surface form
(stems + all expanded affix forms). Flat set — no provenance tracking (i.e.
no record of *which* stem/rule produced a given form). This is a known,
accepted limitation for this milestone: suggestions and morphological
queries would need provenance and are roadmap items.

Duplicate insertions (multiple derivations producing the same surface form)
are a non-issue with a `Set` — no special handling required.

## Language resolver integration

Emma's language resolver is external to this package for this milestone.
`loadLanguage` takes plain `{ aff, dic }` paths; whatever resolves a language
tag to a pair of file paths happens on the caller's side. Resolver-aware
`loadLanguage` input is a roadmap item.
