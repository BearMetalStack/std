# Styling

ANSI colour, text attributes, and — the part that actually decides whether your layout works —
measuring styled text.

```ts
import { bgColorize, bold, colorize, stylize } from "@bearmetal/cli";

console.log(colorize("ready", "green"));
console.log(bold(colorize("BearMetal", "porple")));
console.log(bgColorize(" alert ", "red"));
```

## Colour

```ts
colorize(text, color); // foreground
bgColorize(text, color); // background
```

Named colours: `purple`, `porple`, `red`, `green`, `yellow`, `blue`, `cyan`, `white`, `black`,
`gray` (`grey` works too). `porple` is the house purple, and it is truecolor rather than the
8-colour `purple`.

Any `#rrggbb` string works in the same position:

```ts
colorize("brand", "#aa55ee");
bgColorize(" brand ", "#1b1b2b");
```

`ansiTruecolor(hex, bg?)` gives you the escape directly if you need to compose one by hand.

## Attributes

```ts
stylize(text, "bold", "underline");
```

Or the shorthands: `bold`, `dim`, `italic`, `underline`, `inverse`, `hidden`, `strikethrough`.

::: warning Nesting ends early

Every helper closes with the specific reset for what it opened, so an inner reset ends the outer
style too:

```ts
colorize(`${colorize("?", "porple")} Which database?`, "green");
// "Which database?" is *not* green — the inner reset already fired
```

`bold` and `dim` share the `22` reset, so nesting one inside the other ends both. That is a
limitation of the terminal, not of this code.

Build the styled pieces side by side rather than inside one another. Widgets that colour their own
message — the menus, `cliConfirm` — should be handed plain text.

:::

## When colour is off

```ts
colorEnabled(); // current state
setColorEnabled(false); // override
```

Colour defaults to on only for a TTY, and follows `NO_COLOR` and `FORCE_COLOR`. When it is off,
`colorize` and friends return the text untouched — so the same code produces clean output in a log
file with no branching at the call site.

## Session-wide theme

```ts
using theme = startCliTheme("#25000e", "#f0a8c2");
```

Sets a background and foreground that persist as the _reset_ value for the rest of the block, so
`colorize(...)` inside it returns to your theme rather than to the terminal default. Disposing
restores what was there. Nested themes stack.

## Measuring styled text

This is the one that bites.

```ts
const styled = colorize("bear", "porple") + " 熊";

styled.length; // 29 — counts escape bytes
stripAnsi(styled).length; //  6 — counts 熊 as one
displayWidth(styled); //  7 — what the terminal actually shows
```

A styled string's `.length` is never the number you want, and stripping the escapes still isn't:
CJK, emoji and other wide characters occupy two columns. `displayWidth` strips ANSI _and_ accounts
for width, and it is what every renderer in the package measures with.

```ts
displayWidth(text);
truncateToWidth(text, maxWidth, ellipsis?); // width-aware, keeps styling intact
wrapToWidth(line, columns); // → physical rows
rowsForLine(line, columns); // how many rows it will take
stripAnsi(text);
```

Use these anywhere you pad, align, truncate or centre. `padEnd` on a styled string pads by the
escape bytes and produces a ragged column.

::: tip Style after you measure

Measure and pad the plain text, then colour the result:

```ts
`  ${colorize(name.padEnd(12), "gray")}${value}`; // ✓ padded before styling
`  ${colorize(name, "gray").padEnd(12)}${value}`; // ✗ padded by escape length
```

:::

## Banners

```ts
renderTitleAscii(ascii, { maxWidth: Deno.consoleSize().columns, color: "green" });
```

Renders one of the ASCII art fonts from `@bearmetal/miscellanea` (`bloody`, `poison`, `cyber`,
`doh`, `graffiti`, `tmplr`, …), centred and colour-matched, falling back to the plain form when it
would not fit the width. Some fonts carry their own colours; `pride: true` recolours the ones that
can take it.
