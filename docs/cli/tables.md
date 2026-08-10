# Tables

Aligned columns, measured the way the terminal measures.

```ts
import { table } from "@bearmetal/cli";

console.log(table(
	[["chapter", "Manage chapters"], ["build", "Build the book"]],
	{ headers: ["command", "summary"] },
));
```

```
command  summary
───────  ───────────────
chapter  Manage chapters
build    Build the book
```

::: tip Why this is in the library

Every CLI ends up writing this, and every hand-rolled version gets the same thing wrong: it pads
with `padEnd`, which counts escape bytes and wide characters as one column each. Any colour or any
CJK in a cell and the table comes out ragged. This measures with
[`displayWidth`](./styling#measuring-styled-text) throughout, so styled cells align.

:::

## Columns

```ts
interface ColumnSpec {
	header?: string;
	align?: "left" | "right" | "center";
	/** Hard cap; wider contents are truncated with an ellipsis. */
	maxWidth?: number;
	/** Never shrink below this when the table is squeezed. */
	minWidth?: number;
	/** Colour applied to every cell in the column (not the header). */
	color?: ColorName;
}
```

Pass them positionally. A bare string is shorthand for `{ header }`:

```ts
table(rows, { columns: ["name", { header: "size", align: "right" }] });
```

`headers: [...]` is the shorthand when headers are all you want to set.

## Fitting the terminal

Natural widths are used when they fit. When they don't, the widest column gives up space first, one
column at a time, until the table fits — so one runaway description is trimmed before the columns
next to it are. Nothing shrinks past its `minWidth` or past the room an ellipsis needs.

```ts
table(rows, { width: 60 }); // explicit budget
table(rows, { width: Infinity }); // never squeeze
```

`width` defaults to the terminal width. Inside a session, pass `session.out.columns` — that is the
width the session already knows about, including after a resize.

Other knobs: `gap` (default 2), `rule` (default `"─"`, pass `""` for none), `headerColor` (default
`"gray"`, pass `null` for unstyled), and `indent`, which shifts the block and comes out of the
budget.

Trailing padding on the last column is trimmed, so a full-width table doesn't wrap onto a blank
line.

## definitionList

The two-column `key: value` block most CLI output actually wants:

```ts
import { definitionList } from "@bearmetal/cli";

session.log(definitionList([
	["name", "my-app"],
	["database", "postgres"],
	["auth", "no"],
]));
```

```text
name      my-app
database  postgres
auth      no
```

Keys are grey by default; `keyColor` changes it. `indent` shifts the whole block right, which is
what you usually want under a heading.

## Composing with the rest

A table is a string, so it goes wherever a string goes: through `session.log` while a widget is
live, into a [`Region`](./regions) frame as `table(...).split("\n")`, or straight to `console.log`
between prompts.

```ts
const region = session.region();
region.render(table(rows, { width: session.out.columns }).split("\n"));
```
