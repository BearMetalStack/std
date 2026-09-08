# `@bearmetal/drip/fonts`

Drip themes only _name_ fonts. This module is the one place Drip also _ships_ one — a pared-down
slice of the families the default theme picks, so a stock app renders in its real typefaces with no
Google Fonts call and no config.

| family        | roles                    | faces                   | woff2  |
| ------------- | ------------------------ | ----------------------- | ------ |
| **Comfortaa** | `sans` (+ body, display) | variable, wght 300–700  | ~46 KB |
| **Monofur**   | `mono`                   | Regular / Bold / Italic | ~66 KB |

Both are subset to Latin (Basic + Latin-1 + Extended-A/B) plus punctuation, currency, arrows and
maths operators; Monofur additionally keeps box-drawing and block/geometric shapes. The Nerd Font
private-use icon glyphs, and Greek and Cyrillic, are dropped. A theme that needs wider coverage
should name a different family — Drip will simply not emit a face for it.

## Using it

`BMDripBase` already includes `<Fonts>`, so most apps do nothing. To emit the sheet by hand, or to
force a family a theme doesn't default to:

```tsx
import { Fonts } from "@bearmetal/drip/ssr";

<Fonts theme={theme} />                 // faces for the theme's own defaults
<Fonts theme={theme} fonts={["monofur"]} />  // ...plus Monofur regardless
```

`dripModule()` also serves the same sheet at `/@bearmetal/fonts` (all of the theme's fonts) and
`/@bearmetal/fonts/:name` (one family), for apps that would rather link a cached stylesheet than
inline it.

The pure helpers — `fontFaceCSS`, `themeFontKeys`, `selfHostedFonts`, `fontManifest` — are on
`@bearmetal/drip/fonts`.

## Regenerating

`fonts/assets/**/*.woff2` are the source of truth; `embedded.ts` is generated from them.

```bash
# re-subset from upstream .ttf builds (needs pyftsubset + woff2)
MONOFUR_DIR=... COMFORTAA_VF=... ./fonts/tools/subset.sh
# re-inline the woff2 into embedded.ts
deno task bm:fonts
```
