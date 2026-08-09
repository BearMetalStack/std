# Prompts

Text input, confirmations, and pauses. Each owns a single row, repaints in place, and collapses to a
one-line summary once answered.

```ts
import { cliAlert, cliConfirm, cliPrompt } from "@bearmetal/cli";

const name = await cliPrompt("Project name?", "my-app");
const ok = await cliConfirm("Continue?", true);
await cliAlert("Read the above.");
```

## cliPrompt

```ts
function cliPrompt(message: string, defaultValue?: string): Promise<string>;
function cliPrompt(message: string, options?: PromptOptions): Promise<string>;
```

The second argument is either a default value or an options object:

```ts
interface PromptOptions {
	/** Used when the input is left empty. Shown greyed out as a placeholder. */
	default?: string;
	/** Session to render in. Defaults to the ambient session, or a transient one. */
	session?: CliSession;
	/** Rejects a character before it is inserted. */
	filter?(char: string, current: string): boolean;
	/** Returns an error message to re-prompt, or `null` to accept. */
	validate?(value: string): string | null;
}
```

### filter

`filter` runs per character, before insertion. Return `false` and the keystroke never reaches the
buffer — nothing is drawn, nothing has to be undone.

```ts
const slug = await cliPrompt("Slug?", {
	filter: (char) => /[a-z0-9-]/.test(char),
});
```

It also applies to every character of a pasted burst, so a paste cannot smuggle in what typing
cannot.

::: tip Why this exists

The old way to constrain input was to register a competing key listener and call
`stopImmediatePropagation`, which worked only because of the order the listeners happened to be
registered in. `filter` is the supported replacement — the prompt owns its keys, and you tell it
what to accept.

:::

### validate

`validate` runs on Enter, on the value that would be returned (default included). Return a string to
re-ask with that message shown underneath; return `null` to accept.

```ts
const name = await cliPrompt("Project name?", {
	default: "my-app",
	validate: (value) => value.length >= 2 ? null : "At least two characters, please",
});
```

The error line is dropped as soon as the next key arrives, and is omitted entirely if the session
has fewer than two rows to spare.

### Editing

The usual readline bindings work: arrow keys, Home/End, Delete, and `Ctrl-A`/`Ctrl-E`/`Ctrl-U`/
`Ctrl-K`/`Ctrl-W`. The buffer is held as code points, so editing never splits a multi-byte
character, and the visible window scrolls horizontally when the value outgrows the row.

A bracketed paste arrives as one event and is inserted whole, with newlines flattened to spaces.

## cliConfirm

```ts
const auth = await cliConfirm("Add auth?", true);
```

Prints `(Y/n)` or `(y/N)` from the default, and accepts only the letters that can spell `yes` or
`no` — enforced through the prompt's own `filter` rather than by racing another key listener. An
empty answer takes the default.

## cliAlert

```ts
await cliAlert("Migration complete.");
```

Shows a message and waits for Enter. It is `cliPrompt` with `filter: () => false`, so nothing can be
typed into it.

## cliLog

```ts
cliLog("still working...");
```

Prints without corrupting a live frame: uses the ambient session's `log` if there is one, and falls
back to `console.log` if there isn't. See [Sessions](./sessions#printing-while-something-is-live).

## Without a terminal

In `plain` mode `cliPrompt` writes the message and reads a line from stdin, so piped input works:

```sh
printf 'my-app\npostgres\n' | ./my-cli
```

Leftovers from a read are buffered between calls. That matters more than it sounds: a single read
usually returns _every_ remaining answer at once, so without holding the remainder the first prompt
would swallow the lot and every prompt after it would silently take its default.

`cliConfirm` and `cliAlert` inherit this, since both are built on `cliPrompt`.
