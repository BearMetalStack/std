# Drip: predictability backlog

Findings from authoring one real theme (`Foxfire`, 13 ramps + light/dark variants) end to end
through the MCP tools and then styling a page against the generated stylesheet. Everything here is
something that cost time or produced a silently wrong result — not stylistic preference.

Reference artifacts used throughout: `.bearmetal/drip/themes/Foxfire.theme.json` and
`.bearmetal/drip/stylesheets/Foxfire.css`.

The through-line: **Drip fails silently.** Almost every item below produces valid-looking output
that is wrong at render time rather than an error at generate time. The single highest-value change
is a validation pass in the generator (§1, §2, §5).

> **Status: all resolved.** See the notes under each item for where the fix lives. The generator now
> validates on every run, and `BEARMETAL_DRIP_STRICT=1` turns warnings into a failed build.

---

## 1. `media` is interpolated verbatim — invalid CSS ships silently

**Severity: high.** `add_theme_variant` takes `media` and the generator emits `@media <value> {`
with no parsing, normalisation, or validation.

Passing `prefers-color-scheme: dark` (which the tool's own description invites — it says "without
`@media`") produces:

```css
@media prefers-color-scheme: dark {
	/* invalid — browser discards the entire block */
```

The whole dark variant is dropped by the parser. Nothing warns; the file looks fine; the theme just
has no dark mode. The correct input is `(prefers-color-scheme: dark)`, which only the hand-authored
`BloodMetal` theme happened to use.

**Fix:** normalise and validate at the boundary. Strip a leading `@media`, wrap a bare
`feature: value` in parens, reject unbalanced parens. Patched in the MCP tool already, but the
_generator_ should validate too — a hand-edited theme file bypasses the tool entirely.

> **Done.** `normalizeMediaQuery` (`drip/css/validate.ts`) is now the single implementation; the MCP
> tool imports it instead of carrying its own copy, `buildVariantsCss` runs every query through it
> on emit, and a query that cannot be normalised is a generate-time **error**, not a warning.

## 2. Nothing validates that `var()` references resolve

**Severity: high.** Variant rules are stored as `var(--color-<name>-<stop>)` strings built from the
`$color.path.stop` accessor by naive string replacement:

```ts
`var(${val.replaceAll(".", "-").replace("$", "--")})`;
```

There is no check that the referenced ramp/stop exists. `BloodMetal` currently ships **six dangling
references** — `--color-gold-300`, `--color-gold-500` (the ramp is named `accent_gold`) and
`--color-text_light|medium|muted|subtle` (the ramps are `text_white`/`text_dark`).

This interacts badly with §3: an unregistered custom property that is never set makes the
declaration _guaranteed-invalid at computed-value time_, so `--color-warning-bg` silently inherits
instead of taking a colour, and every consumer of it breaks too. No console error, no visual clue at
generate time.

**Fix:** resolve every accessor against the ramp table during generation and fail (or at minimum
warn loudly) on a miss. `bm:drip` currently prints `generated 5 stylesheets` and nothing else.

> **Done, at both ends.** `add_theme_variant` now walks each `$…` accessor against the theme it is
> writing into and **rejects the call** with the offending references named, so a bad reference
> never reaches the file. The generator independently checks every `var()` against the properties
> the stylesheet defines and warns per rule. Warnings rather than errors by default, because a theme
> may legitimately reference a property supplied by a stylesheet loaded alongside it — strict mode
> promotes them.

## 3. `@property` registration makes failures quieter, not louder

Every stop is registered:

```css
@property --color-bg_base-500 {
	syntax: "<color>";
	inherits: true;
	initial-value: #698274;
}
```

187 registrations for a 13-ramp theme. This is good for interpolation, but it means a _typo'd_
variable name behaves completely differently from a correct one — registered names fall back to
`initial-value`, unregistered names poison the declaration. Two failure modes for what an author
experiences as the same mistake.

**Fix:** worth documenting explicitly, and worth pairing with §2 so the typo case can't arise.

> **Done.** Written up in `drip/README.md` under "Why dangling references are worth an error at
> all", and paired with §2 as suggested.

## 4. Three parallel naming families for semantic tokens

The generated stylesheet mixes:

| Family      | Examples                                                    |
| ----------- | ----------------------------------------------------------- |
| `--color-*` | `--color-bg`, `--color-text-subtle`, `--color-success-text` |
| `--btn-*`   | `--btn-success-bg`, `--btn-danger-bg`                       |
| `--toast-*` | `--toast-bg`, `--toast-color`, `--toast-border`             |

Which family a token lands in is decided by a string-prefix heuristic in `add_theme_variant`:

```ts
if (!name.startsWith("btn") && !name.startsWith("toast")) name = "color-" + name;
```

So `toastColor` becomes `--toast-color` while the analogous body token is `--color-text` — the
suffix means "foreground" in one family and the family name in the other. Any future token whose
camelCase name merely _starts with_ `btn` or `toast` silently joins the wrong family.

**Fix:** one namespace (`--color-*` for colour, or an explicit `role` field per token), and derive
the family from data rather than from a prefix match on the key.

> **Done, the second way.** `drip/css/tokens.ts` is now the single manifest: every token declares
> its authoring key, its exact custom property, its group, and how it derives. The MCP schema is
> _generated_ from that table and the handler resolves each key through `lookupVariantToken`, so the
> prefix match is gone and the tool cannot disagree with the generator about where a token lands.
> The families themselves stay as they were — they match what the compliant CSS already consumes —
> but which one a key belongs to is now recorded rather than inferred.

## 5. No foreground token to pair with the `--btn-*-bg` fills

**Severity: medium — this is a real accessibility gap, not just ergonomics.**

The variant schema defines a background for every filled control but no matching ink. The only
plausible token to reach for is `--color-bg`, and in light mode that fails badly, because the light
variant's fills sit mid-scale (600) while dark's are bright (500):

| Fill               | Light (`--color-bg` ink) | Dark (`--color-bg` ink) |
| ------------------ | ------------------------ | ----------------------- |
| `--btn-warning-bg` | **1.81:1** — illegible   | 10.83:1                 |
| `--btn-success-bg` | **3.28:1**               | 9.68:1                  |
| `--btn-info-bg`    | **4.03:1**               | 7.84:1                  |
| `--btn-danger-bg`  | 5.95:1                   | 5.09:1                  |

For contrast, every text-on-ground pair passes AA comfortably in both variants (lowest is
`--color-text-muted` on `--color-bg` at 4.59:1). The gap is specifically the filled controls.

**Fix:** add `btnSuccessFg` / `btnDangerFg` / … (or a generic `on-fill` per semantic colour) to the
variant schema so the author picks the ink deliberately. Optionally have the generator compute and
warn on sub-4.5:1 pairs it can see.

> **Done.** `btn<Role>Fg` exists for every fill (`success`, `danger`, `warning`, `info`, `accent`)
> and is **required**, so it has to be chosen rather than defaulted. `btn<Role>BgHover` and
> `btn<Role>Border` came along with it. The `design_theme` prompt now calls out that the ink is
> picked against its own fill, not against the page, and that the choice usually flips between
> variants. The automatic contrast check is _not_ implemented — that needs a colour-space pass over
> resolved values and is worth its own change.

## 6. `snake_case` ramp names and `kebab-case` token names share one namespace

Ramp names pass through untouched, variant token names are `toKebabCase`'d. The result is a single
flat namespace containing both:

```css
--color-bg_base-500 /* ramp name, snake_case, from theme JSON */
	--color-bg-subtle /* semantic token, kebab-case, from variant key */
```

`--color-bg_base` and `--color-bg-*` are adjacent, differently-cased, and mean different things.
Worse, hyphens are structural: `create_theme` splits a colour `name` on `-` to build nested objects
(only on the `manualStops` path), so a hyphenated ramp name means something different from a
snake_cased one for reasons that aren't visible at the call site.

**Fix:** pick one case convention and normalise ramp names into it on write.

> **Done.** Ramp names are normalised to kebab-case on write, so `bg_base`, `bgBase` and `BG Base`
> all become `bg-base`. Hyphens are no longer structural on _either_ path — `.` is the nesting
> separator now, mirroring the accessor syntax — so the accessor for a ramp is always its name plus
> the stop. `create_theme` returns the accessors it wrote (`$color.bg-base.<stop>`) so a caller
> never has to guess how its input was normalised. This one was caught by an end-to-end run through
> the real MCP server, not by reading the code.

## 7. Generated CSS is effectively one long line

201 lines, 28KB, **longest line 15,258 characters** — the entire `@property` region plus the `:root`
block. It is technically formatted (tabs and newlines inside the long line) but not line-broken.

Consequences: unreviewable in a diff, and line-oriented tooling gives wrong answers on it. A
straightforward `^\s*(--[\w-]+)\s*:` audit reports 52 false "dangling" references purely because the
definitions aren't at line starts.

**Fix:** emit one declaration per line. The file is generated and gitignored-adjacent; there is no
reason to minify it.

> **Done.** The `isDev()` gate on the joiner is gone; output is always newline-separated. The same
> Foxfire theme now generates 2,342 lines with a longest line of 337 characters.

## 8. The dark `@media` block is unguarded

Emitted as:

```css
:root[data-theme="light"] {
	…
} /* line 99  */
@media (prefers-color-scheme: dark) {
	:root {
		…
	} /* line 133 — unguarded */
}
:root[data-theme="dark"] {
	…
} /* line 169 */
```

This currently behaves correctly: `:root[data-theme="light"]` (0,2,0) outranks the bare `:root`
(0,1,0) inside the media block, so an explicit light choice does beat a dark OS. But it works by
specificity accident rather than intent, and it breaks the moment anyone lowers the light selector's
specificity.

**Fix:** emit `:root:not([data-theme="light"])` inside the media block, matching the standard
three-state pattern.

> **Done**, and generalised: the guard excludes _every_ other variant's name, so a third variant
> gets `:root:not([data-theme="light"]):not([data-theme="sepia"])` rather than relying on source
> order to break the tie.

## 9. Default variant rules are emitted twice

A variant with `default: true` writes its rules to both bare `:root` and
`:root[data-theme="light"]`, verbatim. Correct, but it doubles that block for no benefit —
`:root, :root[data-theme="light"]` would do.

> **Done.** Exactly that.

## 10. Theme JSON shape is awkward to consume

- `#variants` — a `#`-prefixed key sitting at the same level as `color`, so the top level is a mix
  of namespace and metadata.
- Each ramp carries an empty-string key `""` holding the base/seed colour, read as `ramp[""]`. It
  surfaces in CSS as the unstopped `--color-<name>` alias, which isn't reachable through the
  `$color.name.stop` accessor documented in the tool schema — `$color.primary` happens to work only
  because of how the string replacement falls out.

**Fix:** `variants` under a reserved namespace, and a named `base`/`seed` key rather than `""`.

> **Done, without breaking existing themes.** New themes are written with `variants` and `base`;
> `#variants` and `""` are still read, and a theme that already uses `#variants` keeps using it
> rather than ending up with both keys. `base` is only treated as the seed among numeric stops, so a
> token genuinely named `base` elsewhere in the tree (`--radius-base`, `--text-base`) is untouched.

## 11. `readJson()` cannot distinguish "missing" from "corrupt"

`dotBearmetalFile(...).readJson()` (`miscellanea/fs/dotBearmetal.ts:85`) swallows every error and
returns `{}`. `create_theme` relies on this to create-or-merge, which is convenient — but it means
running `create_theme` against a theme file with a JSON syntax error silently discards the entire
existing theme and writes a fresh one.

**Fix:** in `miscellanea`, distinguish `NotFound` (return `{}`) from a parse error (throw). This is
outside `drip/` but bites Drip hardest.

> **Done.** `miscellanea/fs/softRead.ts` holds `readTextIfPresent` / `readJsonIfPresent`: missing
> yields the fallback, a parse failure throws a `SyntaxError` naming the file, and any other read
> error propagates instead of being swallowed. Both `dotBearmetalFile` and `dotBearmetalFileUrl` use
> them, and `read()`'s type is now honestly `Promise<string | undefined>` rather than
> `Promise<string> | undefined` (the old signature could not have caught the rejection it claimed
> to).

---

## Suggested order

1. §1 + §2 + §5 — the correctness/accessibility set, all fixed by a validation pass in the
   generator.
2. §7 + §8 + §9 — output formatting, mechanical and low risk.
3. §4 + §6 + §10 — naming and schema; breaking, so batch them into one version bump.
4. §3 + §11 — documentation and an upstream `miscellanea` fix.

---

## Follow-ups this pass did not close

- **Automatic contrast checking.** §5 gives the author a place to put the ink; it does not check the
  result. A generate-time pass that resolves `btn<Role>Bg`/`btn<Role>Fg` to actual colours and warns
  below 4.5:1 is a natural next step and would need the OKLCH helpers in `miscellanea`.
- **The duplicated stylesheets.** `drip/ssr.tsx` and `webbies/style/mod.ts` each carry a hand-copied
  inline version of `base.css`/`components.css`, still referencing `--color-bearmetal-*` directly.
  They are now out of sync with the compliant files. They should be generated from the same source
  rather than maintained in parallel.
- **`webbies` component tokens.** `webbies/components/data/badge.ts` and `table.tsx` reach for
  `--color-bearmetal-*` ramps, so those components only theme correctly under the bearmetal theme.
  They want `--badge-*` / `--table-*` tokens from the defaults layer.
