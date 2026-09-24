# @bearmetal/flux

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fflux&valueColor=info)](https://jsr.io/@bearmetal/flux)

A Deno-native, dependency-free Hunspell-compatible spell checker. Reads standard Hunspell
`.aff`/`.dic` dictionary pairs (e.g. sourced from the LibreOffice dictionaries repo) and answers "is
this word correct" — and "what did you mean" — for one or more loaded languages.

```ts
import { SpellChecker } from "@bearmetal/flux";

const checker = new SpellChecker();
checker.loadLanguage("en", {
	aff: "./dictionaries/en_US.aff",
	dic: "./dictionaries/en_US.dic",
});

await checker.ready;

checker.check("en", "color"); // true
checker.check("en", "kolor"); // false
checker.suggest("en", "recieve"); // ["receive", "relieve", ...]
checker.checkAndSuggest("en", "teh"); // { correct: false, suggestions: ["the", ...] }
```

## Loading languages

`loadLanguage(lang, paths)` kicks off an independent parse of the given `.aff`/`.dic` pair and
returns a promise for that specific language's settlement. Load as many as you need, under whatever
tag you like:

```ts
checker.loadLanguage("en", { aff: "./en_US.aff", dic: "./en_US.dic" });
checker.loadLanguage("fr", { aff: "./fr_FR.aff", dic: "./fr_FR.dic" });

await checker.ready; // waits for every load currently in flight, never rejects
```

Await a single language instead if you only care about one:

```ts
await checker.langReady("en"); // resolves on success, rejects with the underlying cause on failure
```

`ready` re-arms — load more languages later, and a fresh `await checker.ready` waits for those too.

## Checking words

`check(lang, word)` is always synchronous — it never awaits internally, it just inspects whatever
state that language is currently in:

| State                    | Behavior                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| never `loadLanguage`'d   | throws `UnknownLanguageError`                                      |
| loading, not yet settled | throws `LanguagePendingError` — await `ready` or `langReady` first |
| loaded, failed           | throws `LanguageLoadFailedError` (`.cause` has why)                |
| loaded, succeeded        | returns `true` / `false`                                           |

Scope a checker to one language with `forLanguage`:

```ts
const en = checker.forLanguage("en");
en.check("color"); // true
en.suggest("colr"); // ["color", ...]
```

### Hyphenated words

A hyphenated word that isn't in the dictionary as a whole falls back to checking each `-`-separated
segment on its own — `"well-known"` is correct if both `"well"` and `"known"` are. Empty segments
from a leading, trailing, or doubled hyphen (`"-well"`, `"well-"`, `"well--known"`) are skipped
rather than failing the word outright.

This is a known trade-off, not a bug: a hyphenated phrase where every part happens to be a real word
but the compound itself isn't idiomatic will false-positive as correct. No phrase dictionary is
planned to address this.

## Suggestions

Three surfaces, all synchronous and all throwing in the same states `check` does:

| Method                                  | Returns                                                       |
| --------------------------------------- | ------------------------------------------------------------- |
| `check(lang, word)`                     | `boolean`                                                     |
| `suggest(lang, word, options?)`         | `string[]`, best first — for any word, correct or not         |
| `checkAndSuggest(lang, word, options?)` | `{ correct, suggestions }` — suggestions only when misspelled |

`suggest` is the manual "what else could this be" request: it doesn't check first, so a correct word
gets its nearest neighbours. It never returns the word itself. `checkAndSuggest` is the one to call
in a loop over text — a correct word costs one lookup and nothing more.

```ts
checker.suggest("en", "Thier"); // ["Their", "Thief", ...]
checker.suggest("en", "alot"); // ["a lot", ...]
checker.suggest("en", "well-knwon"); // ["well-known"]
checker.suggest("en", "teh", { limit: 3 }); // ["the", "tech", "tee"]
```

Options:

| Option        | Default                                  | Meaning                                             |
| ------------- | ---------------------------------------- | --------------------------------------------------- |
| `limit`       | `8`                                      | most suggestions returned                           |
| `maxDistance` | `1` for words ≤ 3 characters, `2` beyond | furthest a suggestion found by edit distance may be |

Candidates are ranked in this order:

1. **Capitalization fixes** — `nasa` → `NASA`, `paris` → `Paris`.
2. **The `.aff`'s `REP` table** — the dictionary's own list of common misspellings (`f` → `ph`,
   `alot` → `a lot`), however many edits they take.
3. **Single edits** — a swapped pair of letters, then a missing letter, then a wrong or extra one.
   Substituted and inserted letters come from the `.aff`'s `TRY` line, or from the characters the
   dictionary uses when it has none.
4. **Two words run together** — `inthe` → `in the`, when both halves are at least two characters.
5. **Anything else within `maxDistance`**, by Damerau–Levenshtein distance (a swapped pair counts as
   one edit). This is the only step that scans the dictionary, and it runs only when the steps above
   found fewer than `limit` candidates.

Ties go to the suggestion that shares a longer prefix with the word, then the one closer in length.
Suggestions keep the word's capitalization (`Teh` → `The`, `TEH` → `THE`), and a hyphenated word has
each misspelled segment corrected in place. Distances are counted in code points, so an emoji or
other astral-plane character is one character, not two.

The first suggestion request per language builds a length-bucketed index of the dictionary (~40 ms
for en_US); after that a typical misspelling takes a few milliseconds.

## Errors

| Error                     | Thrown by                 | When                                                           |
| ------------------------- | ------------------------- | -------------------------------------------------------------- |
| `UnknownLanguageError`    | every lookup, `langReady` | `loadLanguage` was never called for that tag                   |
| `LanguagePendingError`    | every lookup              | `loadLanguage` was called but hasn't settled yet               |
| `LanguageLoadFailedError` | every lookup              | the load settled and failed; `.cause` has the underlying error |
| `DictionaryNotFoundError` | a rejection's `cause`     | a given `.aff`/`.dic` path doesn't exist                       |

## Scope

Correctness checking against Hunspell `SFX`/`PFX` affix expansion, `FLAG` modes (default/long/num),
`ICONV`, and simple hyphenation, plus suggestions driven by `REP`, `TRY` and edit distance. Text
tokenization, compound-word support (`COMPOUND*` directives), phonetic and keyboard-aware
suggestions (`PHONE`, `MAP`, `KEY`), and non-path dictionary loading aren't implemented yet — see
`ROADMAP.md`.
