<p align="center">
  <img src="https://cdn.bear-metal.dev/resources/images/dripicon.svg" alt="BearMetal" width="240">
</p>

# @bearmetal/drip

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fdrip&valueColor=info)](https://jsr.io/@bearmetal/drip)

BearMetal's stylesheet and theme manager. Themes are defined as color scales and generate CSS custom
properties, completions, and stylesheets on build; the `bearmetal` CLI drives theme creation and
switching, and `drip/palette` ships a visual editor (Drip Palette) for building a theme's color
scale by eye. `drip/ssr` and `drip/namespaces` integrate the generated stylesheet into
server-rendered JSX.

## How a stylesheet is put together

A generated stylesheet has three layers, in cascade order:

1. **Ramps** — every stop of every color scale in the theme, as `--color-<ramp>-<stop>`.
2. **The defaults layer** (`themes/_defaults.theme.json`) — spacing, radii, the type scale, shadows,
   and every per-component token (`--btn-*`, `--input-*`, `--card-*`, …). Component tokens are
   written in terms of the variant tokens below, never in terms of a particular ramp, so they work
   in any theme. It is merged underneath every theme, so a theme only has to supply color.
3. **Variant blocks** — one per theme variant, holding the semantic color tokens.

`data-theme` works on any element, not only the root. Every token defined as a `var()` reference
(the component tokens above, mostly) is re-declared on `[data-theme]`, because a custom property's
`var()` is resolved where it is declared: declared only on `:root`, a `data-theme="dark"` sidebar
would inherit `--btn-primary-bg` already resolved against the page's variant.

A theme that defines nothing but ramps and variants still produces a stylesheet that drives all of
`base.css` and `components.css`.

Because the defaults layer is merged _underneath_ a theme, key by key, a theme can override any of
it, not just color: `"radius": { "base": "0" }` squares every corner, `"duration"` set to `0ms`
turns off motion. The sections below describe the pieces that exist specifically so a theme can
change the _look_ of the stack, not only its palette.

## The compliant stylesheets

`css/base.css`, `css/components.css` and `css/animations.css` are the element and component rules
written against the tokens. They are the only copy: `deno task bm:css` embeds them into
`css/embedded.ts`, which is what `drip/ssr` (`BaseStyle`, `ComponentStyle`, `BMDripBase`),
`compliantCSS()` and webbies read, and a test fails if the two disagree. Edit the `.css` files, then
run the task.

A test also fails if any `var()` in them names a property the generated stylesheet doesn't define.
`var(--x, fallback)` is the exception: it marks an optional hook a theme may leave out.

## Corner shape and radius

- `corner.shape` → `--corner-shape` is applied to every element (`round`, `bevel`, `notch`, `scoop`,
  `square`, `squircle`, `superellipse(…)`). Browsers without `corner-shape` keep round corners.
- `corner.pill` → `--corner-pill` is used by the fully rounded things (badges, spinners, handles).
  It follows `corner.shape` by default; set it separately so a bevelled theme doesn't turn every
  pill into a hexagon.
- Every `radius.<step>` is `radius.base` times `radius.scale.<step>`. Override `radius.base` to
  scale the whole set, or `radius.scale.*` to flatten or steepen the curve.

Shadow-root styles don't match the document's `*` rule, so a component with a shadow root sets
`corner-shape` on its own surfaces.

## Treatment tokens

Variant tokens say what color a state is. Treatment tokens say how it is _drawn_, which is what a
theme for grayscale or e-ink displays needs to change. They live in the defaults layer (and so at
the theme's top level, not in a variant), and every default reproduces the stack's original look.

| Group            | Tokens                                                                                                | Drawn as                             |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `state.hover`    | `bg`, `decoration`                                                                                    | fill, `text-decoration`              |
| `state.selected` | `bg`, `color`, `weight`, `indicator`                                                                  | fill, ink, `font-weight`, box-shadow |
| `state.pressed`  | `indicator`, `overlay`, `translate`                                                                   | box-shadow, overlay fill, nudge      |
| `state.disabled` | `opacity`, `cursor`, `pattern`, `border.style`                                                        | `background-image` for `pattern`     |
| `state.focus`    | `width`, `style`, `offset`, `color`                                                                   | the `:focus-visible` outline         |
| `state.invalid`  | `border.style`, `border.width`                                                                        | the control's border                 |
| others           | `border.rule`, `motion.scroll`, `spinner.duration`, `skeleton.animation`, `alert.<role>.border.style` |                                      |

- An **indicator** is a `box-shadow`, so one channel covers an underline
  (`inset 0 -2px 0 0
  currentColor`), a side bar (`inset 3px 0 0 0 currentColor`) or an inset
  outline.
- `border.rule` is the width of every line that separates surfaces: cards, modals, menus, tables,
  dividers, inputs.
- Component state tokens (`nav.item.*`, `tab.item.*`, `dropdown.item.*`, `table.row.*`,
  `btn.decoration.hover`, …) reference `state.*`, so one override restyles every selected thing at
  once. Override the component token to change just one.
- `btn.disabled.{bg,color,border}` are optional hooks. A theme that leaves them out keeps each
  button variant's own colors when it is disabled.

`components.css` applies these by ARIA state, so markup from anywhere picks them up:
`[role=tablist]`/`[role=tab][aria-selected]`, the current page in a `nav` (`aria-current` or
`data-active`, which router `Link` sets; only the state treatment, not the layout), menus and
listboxes (`aria-selected`, `aria-checked`), `aria-pressed`, `aria-invalid`, `aria-disabled`,
tables, and `.alert`.

A value in a theme file can't contain `.`: the generator turns dots into `-`, so write `0.5` as
`0__5`.

## Required color ramps

Every theme needs the same eleven base ramps — `brand`, `accent`, `neutral`, and the eight hues
`red`, `orange`, `yellow`, `green`, `blue`, `magenta`, `cyan`, `pink` — plus four semantic ramps —
`success`, `danger`, `warning`, `info`. The names are structural, not decorative: components
reference `--color-neutral-100` or `--color-red-500` directly in places a variant token doesn't
cover, so a theme that names its neutral ramp something else silently loses those colors the moment
it's swapped in. `REQUIRED_BASE_RAMPS` and `SEMANTIC_ROLES` in `css/ramps.ts` (`@bearmetal/drip`)
are the canonical list; `validateRamps` checks a theme against it at generate time.

A semantic ramp is never seeded independently — it's a full **alias** into one of the eight hues, so
state colors never compete with the brand for attention and a theme can't accidentally make "danger"
the same hue as its own brand color. Every stop is a `$color.<hue>.<stop>` accessor, and `base` is
`$color.<hue>` (the hue's bare identity, not `$color.<hue>.base` — a ramp's identity is emitted at
its bare `--color-<hue>` property):

```jsonc
"danger": {
	"50": "$color.red.50", "100": "$color.red.100", /* … */ "950": "$color.red.950",
	"base": "$color.red"
}
```

The typical mapping is `danger`→`red`, `warning`→`orange`, `success`→`green`, `info`→`blue`; a theme
can alias a different hue instead (a theme where blue already carries the brand might make `info`
alias `cyan`), but every theme must alias _something_ — a bespoke, independently-seeded semantic
ramp defeats the point of having a fixed set of hues to draw from.

Both the `bearmetal` CLI's interactive wizard and the MCP `create_theme` tool (via its `alias`
field) walk you through this: required ramps first, then any freeform extras, then the four semantic
roles.

## Variant tokens

Variant tokens are the semantic color slots that change between light, dark, or any other variant.
They are the contract between a theme and a stylesheet: define these and the page follows. The
canonical list lives in `css/tokens.ts` and is exported as `VARIANT_TOKENS` (also available as
`@bearmetal/drip/tokens`) — the MCP tooling, the generator, and the docs all read that one table, so
they cannot drift apart.

Each token has an authoring key (`btnSuccessFg`) and the CSS custom property it writes to
(`--btn-success-color`). **The mapping is data, not a prefix match** — don't infer one from the
other.

### Required vs derived, and the default variant

A little over twenty tokens are required: the grounds, the inks, and the fills whose contrast only
the author can judge. Everything else derives from one of those if a variant leaves it out, emitted
as a `var()` reference to the token it derives from:

```css
:root,
:root[data-theme="light"] {
	--color-bg: #faf8fc;
	--color-bg-subtle: var(--color-bg); /* not set by the variant; derived */
}
```

The reference form is deliberate: the relationship stays visible in the output, and the derived
token keeps tracking its source if that source is overridden further down the cascade.

Omitting a _required_ token is reported at generate time. It still gets a last-resort value so the
stylesheet stays valid, but that value is a guess, not a choice.

The **default** variant is held to a stricter rule than the rest: it must set _every_ token in
`VARIANT_TOKENS`, required or not, not just the required subset. This isn't arbitrary — the default
variant's rules are emitted against a bare `:root` selector in addition to its own `[data-theme]`
block (see `buildVariantsCss`), so any token another variant leaves unset falls through to whatever
the default variant set for it, via ordinary CSS specificity. A default variant with gaps means
those gaps propagate silently into every other variant too. A non-default variant (dark mode, high
contrast, …) only needs to state what actually _changes_ for it — that's the whole point of having a
complete default to fall back to. Both the CLI wizard and the MCP `add_theme_variant` tool enforce
this: a default variant missing a token is a hard error, a non-default one missing an optional token
is just a note.

### Structural tokens in a variant

A variant may also restate a token from the defaults layer, not only the color slots. A
high-contrast variant can set `--border-rule: 2px` or `--state-focus-width: 4px`, and the rule
reaches everything built on it, including under a scoped `data-theme`. A variant rule that is
neither a variant token nor a token the theme defines is reported as a likely typo.

### The `btn*Fg` tokens

Every filled control has both a fill (`btn<Role>Bg`) and an ink (`btn<Role>Fg`). Pick the ink
against its own fill, not against the page — a bright fill wants dark ink and a dark fill wants
light ink, and the right answer usually flips between light and dark variants. Without a dedicated
ink token the only thing in reach is `--color-bg`, which lands as low as 1.8:1 on a mid-scale
light-mode fill.

## Generate-time validation

`deno task bm:drip` checks each theme as it generates it and reports:

- media queries that would not parse (an error — a browser discards the entire variant block, so the
  theme silently has no dark mode);
- `var()` references that nothing defines (a warning — the theme may be loaded alongside a
  stylesheet that supplies them);
- required variant tokens a variant left out (every token, for the default variant), duplicate
  variant names, more than one default variant, and a theme with no default variant at all;
- a variant rule naming a property that is neither a variant token nor one the theme defines (a
  warning — almost always a typo);
- a required base or semantic ramp that's missing, or that exists but isn't shaped like a color
  scale (`validateRamps`, `css/ramps.ts`).

Set `BEARMETAL_DRIP_STRICT=1` to promote warnings to errors and fail generation instead.

### Why dangling references are worth an error at all

Every token is registered with `@property`:

```css
@property --color-bg-base-500 {
	syntax: "<color>";
	inherits: true;
	initial-value: #698274;
}
```

This is good for interpolation, but it means a _registered_ name and a _typo'd_ one fail in
completely different ways. A registered property falls back to its `initial-value`; an unregistered
one makes the declaration invalid at computed-value time, so the token silently inherits — and every
consumer of it breaks too. The author experiences both as "the same typo", so the generator catches
the reference instead of letting the browser decide which flavour of wrong to serve.

## Bundled themes

`bearmetal`, `pride`, `foxfire`, `hazelthorn`, and `monochrome` ship in `themes/` and resolve by
name anywhere a theme name is accepted (`drip.defaultTheme`, `loadTheme`, the palette). A project
theme with the same name under `.bearmetal/drip/themes` takes precedence. `pride` carries a variant
per flag (`lesbian`, `gay`, `trans`, `nonbinary`, `bisexual`, `pansexual`, `asexual`, `aromantic`,
`progress`) alongside `light` and `dark`; select one with `data-theme`.

`monochrome` is for grayscale and e-ink displays, and is the reference for the treatment tokens.
Surfaces are separated by rules rather than fills, and they stay opaque. The primary button is the
one solid fill. The semantic hues are kept and outlined, so a grayscale conversion still has
something to work with. Every state reads without color:

- selected is bold with an inset bar;
- hover underlines;
- pressed insets;
- disabled is dashed and hatched;
- invalid is a double rule;
- each alert role has its own border style.

Soft shadows become hard offsets and motion is off. Its variants are `light` (default), `dark`, and
`high-contrast` (`(prefers-contrast: more) and (prefers-color-scheme: light)`), which also thickens
rules and the focus ring.

Every bundled variant states every token rather than relying on derivation, and `theme.test.ts`
holds each bundled theme to zero generate-time diagnostics. `BUILTIN_THEMES` in `theme.ts` is the
list, since a published package has no directory to read it from — add a new file there too.

## Theme file shape

```jsonc
{
	"color": {
		"brand": { "50": "#…", "500": "#…", "950": "#…", "base": "#…" }
	},
	"variants": [
		{ "name": "light", "default": true, "rules": { "--color-bg": "var(--color-neutral-50)" } },
		{ "name": "dark", "media": "(prefers-color-scheme: dark)", "rules": { "…": "…" } }
	]
}
```

- A ramp's seed lives under `base`. The older empty-string key (`""`) is still read.
- Variants live under `variants`. The older `#variants` key is still read, and a theme that already
  uses it keeps using it.
- Ramp names are kebab-case. `.` nests a ramp (`brand.grey` → `--color-brand-grey-500`); `-` is part
  of the name, never structure, so the accessor for a ramp is always its name plus the stop.
