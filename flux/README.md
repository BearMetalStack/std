# @bearmetal/flux

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fflux&valueColor=info)](https://jsr.io/@bearmetal/flux)

A Deno-native, dependency-free Hunspell-compatible spell checker. Reads standard Hunspell
`.aff`/`.dic` dictionary pairs (e.g. sourced from the LibreOffice dictionaries repo) and answers "is
this word correct" for one or more loaded languages.

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
```

### Hyphenated words

A hyphenated word that isn't in the dictionary as a whole falls back to checking each `-`-separated
segment on its own — `"well-known"` is correct if both `"well"` and `"known"` are. Empty segments
from a leading, trailing, or doubled hyphen (`"-well"`, `"well-"`, `"well--known"`) are skipped
rather than failing the word outright.

This is a known trade-off, not a bug: a hyphenated phrase where every part happens to be a real word
but the compound itself isn't idiomatic will false-positive as correct. No phrase dictionary is
planned to address this.

## Errors

| Error                     | Thrown by             | When                                                           |
| ------------------------- | --------------------- | -------------------------------------------------------------- |
| `UnknownLanguageError`    | `check`, `langReady`  | `loadLanguage` was never called for that tag                   |
| `LanguagePendingError`    | `check`               | `loadLanguage` was called but hasn't settled yet               |
| `LanguageLoadFailedError` | `check`               | the load settled and failed; `.cause` has the underlying error |
| `DictionaryNotFoundError` | a rejection's `cause` | a given `.aff`/`.dic` path doesn't exist                       |

## Scope

This is the first milestone: boolean correctness checking against Hunspell `SFX`/`PFX` affix
expansion, `FLAG` modes (default/long/num), and simple hyphenation. Suggestions ("did you mean"),
text tokenization, compound-word support (`COMPOUND*` directives), and non-path dictionary loading
aren't implemented yet — see `ROADMAP.md`.
