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

A theme that defines nothing but ramps and variants still produces a stylesheet that drives all of
`base.css` and `components.css`.

## Variant tokens

Variant tokens are the semantic color slots that change between light, dark, or any other variant.
They are the contract between a theme and a stylesheet: define these and the page follows. The
canonical list lives in `css/tokens.ts` and is exported as `VARIANT_TOKENS` (also available as
`@bearmetal/drip/tokens`) — the MCP tooling, the generator, and the docs all read that one table, so
they cannot drift apart.

Each token has an authoring key (`btnSuccessFg`) and the CSS custom property it writes to
(`--btn-success-color`). **The mapping is data, not a prefix match** — don't infer one from the
other.

### Required vs derived

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
- required variant tokens a variant left out, duplicate variant names, more than one default
  variant, and a theme with no default variant at all.

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

## Theme file shape

```jsonc
{
	"color": {
		"primary": { "50": "#…", "500": "#…", "950": "#…", "base": "#…" }
	},
	"variants": [
		{ "name": "light", "default": true, "rules": { "--color-bg": "var(--color-primary-50)" } },
		{ "name": "dark", "media": "(prefers-color-scheme: dark)", "rules": { "…": "…" } }
	]
}
```

- A ramp's seed lives under `base`. The older empty-string key (`""`) is still read.
- Variants live under `variants`. The older `#variants` key is still read, and a theme that already
  uses it keeps using it.
- Ramp names are kebab-case. `.` nests a ramp (`brand.grey` → `--color-brand-grey-500`); `-` is part
  of the name, never structure, so the accessor for a ramp is always its name plus the stop.
