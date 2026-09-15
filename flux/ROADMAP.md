# @bearmetal/flux — ROADMAP

Items intentionally deferred out of the current SPEC.md milestone. Each entry
notes why it was punted and what it depends on, so a future pass has context
without re-deriving it.

## Loading

- **Non-path `loadLanguage` inputs.** Accept `URL | string | Uint8Array` or a
  resolver-shaped object directly, instead of only `{ aff, dic }` file paths.
  Emma already has a language resolver built for BearMetal generally; wiring
  it directly into this package (rather than requiring the caller to resolve
  first) is the natural next step once path-based loading is proven.
  Would likely introduce a `DictionaryResolutionError` (resolver failed to
  resolve) as distinct from `DictionaryNotFoundError` (path given, file
  missing) — the two are different failure modes and shouldn't share an
  error type once resolution is handled inside the package.

- **`unloadLanguage(lang)` / eviction.** For memory-constrained environments
  where holding every loaded language's expanded lookup set indefinitely
  isn't acceptable. No pressure to build until there's a concrete case
  needing it.

## Checking

- **`checkText(lang, text)` + tokenization.** Real usage is "check this
  paragraph," not one word at a time. Deferred because tokenization is
  itself language-dependent in non-trivial ways (punctuation stripping,
  contraction handling, hyphenation-as-word-break vs hyphenation-as-compound),
  and conflating tokenizer design with the core lookup engine risked scope
  creep. Likely lands as either a method on `SpellChecker` or a separate
  utility that produces `{ word, index, correct }[]`.

- **`checker.forLanguages(...langKeys)` builder.** Multi-tenant single-pass
  checking for mixed-language text (e.g. a novel character who speaks German
  as an in-fiction signal). Builds on top of the existing `forLanguage`
  sugar pattern — a checker that queries multiple loaded languages in one
  pass rather than requiring the caller to pick a language per call.

- **`getWarnings(lang)`.** Formal collection of unhandled-directive warnings
  encountered during `.aff` parsing (currently just an inline debug-flagged
  `console.warn`). Useful for dev tooling surfacing "this language pack uses
  features we don't support yet" without grepping console output. Natural
  fit once the two-stage parse/build split (below) exists, since warnings
  are inherently a parse-time artifact.

## Parser architecture

- **Two-stage parse (AST) → build (lookup structure) split.** Currently
  single-pass: the `.aff` parser emits the final `Suffixes`/`Prefixes`
  tables directly. A future pass could parse to a literal structured AST
  first (mirroring file structure 1:1), with a separate build step turning
  that into lookup tables. Benefits: parser becomes testable against `.aff`
  fixtures independent of how lookup gets built; gives `getWarnings` a
  natural home; makes future directive support (compounding, continuation
  flags) additive rather than requiring parser rewrites.

- **Recursive continuation flags.** Hunspell suffixes/prefixes can carry
  their own continuation flags, meaning an affixed form can itself accept
  further affixation (recursive expansion). Not implemented in the current
  single-pass expansion — `add/<continuation-flags>` is parsed but the
  continuation flags are currently inert.

- **Lazy cross-product expansion.** Current milestone expands
  prefix×suffix combinations eagerly at load time. For languages/dictionaries
  where this is impractically large, expand independently and only combine
  on lookup miss instead. Not needed yet — no language in current scope has
  hit this wall — but noted since eager-vs-lazy was an explicit decision
  point.

- **Provenance-tracking lookup structure.** Current target is a flat
  `Set<string>` — valid forms in, no record of which stem/rule produced a
  given form. Suggestions and morphological queries would need to know
  *why* a form is valid (which stem, which rule chain), which a flat `Set`
  can't answer. Revisit the lookup structure's shape (trie with metadata?
  map to provenance records?) if/when suggestions work begins.

## Compounding

- **`COMPOUND*` affix directive support** (`COMPOUNDFLAG`, `COMPOUNDRULE`,
  `COMPOUNDMIN`, `COMPOUNDPERMITFLAG`, etc). Currently recognized-but-inert
  at parse time (see SPEC.md's unhandled-directive handling). This is a
  project-sized chunk on its own, not a small addition:
  - Naive recursive substring matching against a flat `Set<string>` is
    unworkable (effectively O(n²)+ per word) and doesn't respect actual
    compound rules anyway (min part length, eligible-flag constraints,
    per-position capitalization rules, hyphen requirements vary by
    language).
  - Properly supporting it likely needs a trie-based structure so a word
    can be walked left-to-right with the parser knowing at each prefix
    whether continuation is even valid, rather than trying arbitrary
    substring splits.
  - Requires actually reading and acting on the `COMPOUND*` directives
    currently just logged past.
  - German, Hungarian, and Finnish dictionaries lean on this heavily;
    those languages' correctness checking will have known gaps until this
    lands.

## Suggestions

- **Edit-distance/"did you mean" ranking.** Entirely out of scope until
  boolean correctness checking is solid. Will need `REP`/`PHONE` table
  parsing from `.aff` (currently skipped entirely) plus the
  provenance-tracking lookup structure noted above.
