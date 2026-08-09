# Menus

Arrow-key selection, single or multiple, rendered inline.

```ts
import { multiSelectMenuInteractive, selectMenuInteractive } from "@bearmetal/cli";

const db = await selectMenuInteractive("Database?", ["postgres", "kv", "none"]);
const extras = await multiSelectMenuInteractive("Extras?", ["auth", "drip"], { allOption: true });
```

## selectMenuInteractive

```ts
function selectMenuInteractive(
	q: string,
	options: SelectOption[],
	config?: SelectMenuConfig,
): Promise<string | null>;

type SelectOption = string | [string, string];
```

An option is a label, or a `[label, value]` pair. What comes back is the **value** — the label is
only what was shown.

```ts
const db = await selectMenuInteractive("Database?", [
	["Postgres", "postgres"],
	["Deno KV", "kv"],
	["None", "none"],
]);
```

Keys: arrows to move, Home/End to jump, PageUp/PageDown by a screenful, Enter to choose, Escape to
dismiss. Typing digits jumps to a numbered entry on Enter.

`null` means **dismissed**, and is worth handling explicitly:

```ts
const db = await selectMenuInteractive("Database?", options);
if (db === null) return cancel();
```

## multiSelectMenuInteractive

```ts
function multiSelectMenuInteractive(
	q: string,
	options: MultiSelectOption[],
	config?: MultiSelectMenuConfig,
): Promise<string[] | null>;

type MultiSelectOption = string | [string, SelectCallback];
```

Space toggles, Enter accepts. It returns the chosen **labels**, or `null` if dismissed — so an empty
array and `null` are different answers: "none of them" versus "never mind".

`allOption: true` prepends a _Select All_ row, which stays checked only for as long as everything
else is.

The pair form takes a callback rather than a value. Every chosen entry's callback is awaited, in
order, after the menu closes:

```ts
await multiSelectMenuInteractive("Run which?", [
	["migrate", () => runMigrations()],
	["seed", () => seedDatabase()],
]);
```

## Configuration

```ts
interface SelectMenuConfig {
	initialSelection?: number;
	initialSelections?: number[];
	session?: CliSession;
	/** Keeps the menu inline even when it does not fit, instead of taking the screen. */
	neverEscalate?: boolean;
}

interface MultiSelectMenuConfig extends SelectMenuConfig {
	allOption?: boolean;
}
```

## Long lists

A menu keeps the selection in view by windowing: only the slice that fits is drawn, and it scrolls
with the cursor. If the whole list would not fit inline at all, the menu escalates to the alternate
screen for its own lifetime — because the alternative is pushing every bit of surrounding context
out of view anyway — then returns and leaves its summary line behind.

`neverEscalate: true` opts out and keeps it windowed inline.

::: info Why menus used to eat your screen

They rendered from the screen's home position, which is only a meaningful place to start if you own
the whole screen. So they took the alternate screen to _make_ it true, destroying whatever had been
printed before them. Now they render relative to where they were mounted, and only reach for the
screen when the content genuinely does not fit.

:::

## Without a terminal

Both throw `NotInteractiveError` in `plain` mode. There is no line-based fallback that isn't a trap:
silently taking the first option is worse than an error.

Either check the mode up front, or give the value a non-interactive path through
[`ArgParser`](./args) — an `enum` arg prompts with this menu when it can and reports a missing
`--flag` when it can't.

## selectMenu

```ts
const choice = selectMenu(["one", "two"]);
```

The non-interactive fallback: prints a numbered list and reads a number with the platform
`prompt()`. No cursor control, no session, no arrow keys. It exists for scripts that want a choice
without a terminal and is not part of the widget system.
