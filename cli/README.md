# @bearmetal/cli

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fcli&valueColor=info)](https://jsr.io/@bearmetal/cli)

Terminal styling, prompts, and argument parsing shared across every CLI in the stack — including
`stack`'s setup wizard and the `bearmetal` tool itself. Covers ANSI truecolor output, cursor
control, interactive prompts and selection menus, and a declarative argument parser (`argParser/`)
that builds typed commands, flags, and validation straight from a config object.

## Prompts and menus

```ts
import { cliConfirm, cliPrompt, selectMenuInteractive } from "@bearmetal/cli";

const name = await cliPrompt("Project name?", "my-app");
const db = await selectMenuInteractive("Database?", ["postgres", "kv"]);
const auth = await cliConfirm("Add auth?", true);
```

Each widget draws in place below whatever has already been printed, then collapses to a one-line
summary once answered. Ordinary `console.log` output between prompts survives, so a wizard reads
back as a clean transcript.

## Inline and the alternate screen

Rendering is **inline** by default: a widget owns a block of rows, repaints it by moving the cursor
only relative to where it last left it, and erases it when it is done. Nothing takes over the
screen, so surrounding output is never destroyed.

The alternate screen is available, in two ways:

```ts
import { startCliSession } from "@bearmetal/cli";

// Explicit: the whole run happens on the alternate screen.
using session = startCliSession({ mode: "alt" });
```

- **Explicit** — everything inside the session renders on the alternate screen, and the primary
  buffer is restored untouched on dispose. Worth choosing for a long full-screen flow, and for
  resize behaviour: the alternate screen can be repainted cleanly after a `SIGWINCH`, whereas inline
  output has already been reflowed by the terminal.
- **Automatic** — a widget whose content is taller than the terminal switches to the alternate
  screen for its own lifetime rather than pushing everything above it out of view, then returns and
  leaves its summary line behind. Pass `neverEscalate: true` to a menu to opt out.

A menu short enough to fit never swaps the screen.

## Printing while a widget is live

A region tracks the rows it occupies. Writing to the terminal from somewhere else while a widget is
on screen invalidates that, and the next repaint smears. Inside a session, print through the session
instead:

```ts
session.log("still working...");
```

or hand the problem over wholesale:

```ts
using session = startCliSession({ captureConsole: true });
```

which routes `console.log`/`warn`/`error`/`info` through the same path for the session's lifetime.
Output printed _between_ widgets needs none of this — it is ordinary scrollback.

## Sessions

`startCliSession()` is optional. A bare `await cliPrompt(...)` creates a transient session and
disposes it when the prompt is done. Start one explicitly to share a single terminal restore across
a sequence of prompts, to select `mode`, or to opt into `captureConsole`.

`ArgParser.resolve()` opens one for the whole prompt sequence; `setInteractiveMode("alt")` chooses
its mode. `canPrompt()` answers "may I ask a question here?" without needing a session reference.

## Arguments

```ts
const args = await ArgParser.commandFrom(Deno.args, {
	$root: { json: { type: "flag" } },
	chapter: {
		$commands: {
			list: {},
			new: {
				title: { type: "string", required: true },
				draft: { type: "positional", required: true },
			},
		},
	},
}).setProgram("tmstn").setHelpMode("throw").resolve();

switch (args.command) {
	case "chapter new":
		return create(args.title, args.draft);
}
```

Commands nest to any depth through `$commands`, and `command` is the matched path. A token belongs
to whichever level declares it, so `--json` works before or after the command name. Positionals are
declared like any other arg and get documented, arity-checked and typed.

Anything the defs don't account for is an error listing every problem at once — an unknown option
(with a suggestion), a value written `--name value` instead of `--name=value`, a positional too
many. Nothing is silently dropped.

`promptFor(def)` asks for a single arg with `resolve()`'s exact semantics, for code that builds its
own contexts instead of parsing argv.

## Not a terminal

With stdout redirected, sessions run in `plain` mode: no escape sequences are emitted at all,
`cliPrompt` reads a line from stdin so piped answers still work, and menus throw
`NotInteractiveError`. `ArgParser` goes non-interactive and reports missing arguments instead of
prompting. Colour follows `NO_COLOR`/`FORCE_COLOR`, defaulting to on only for a TTY, and
`setColorEnabled()` overrides.

## Testing interactive code

`@bearmetal/cli/testing` ships the harness the package tests itself with:

```ts
import { BufferWriter, FakeKeyReader } from "@bearmetal/cli/testing";

const out = new BufferWriter(80, 24);
const keys = new FakeKeyReader();
using session = startCliSession({ writer: out, reader: keys });

const answer = cliPrompt("Name?", { session });
keys.type("bearmetal");
keys.press("enter");

assertEquals(await answer, "bearmetal");
assertEquals(out.lines(), ["Name? bearmetal"]);
```

`BufferWriter` interprets the escape sequences it is given into a grid, so assertions are about the
rendered screen rather than a string of control codes. None of it needs a terminal.

## Exports

| Subpath       | Contents                                                           |
| ------------- | ------------------------------------------------------------------ |
| `.`           | Everything below, plus `renderTitleAscii` and `startCliTheme`      |
| `./style`     | Colour, attributes, `stripAnsi`, `displayWidth`, `truncateToWidth` |
| `./table`     | `table`, `definitionList`                                          |
| `./argParser` | `ArgParser`, `CommandArgParser`, `promptFor`                       |
| `./input`     | `KeyDecoder`, `KeyReader`                                          |
| `./render`    | `Region`, `CliSession`, `TerminalWriter`, `canPrompt`              |
| `./testing`   | `BufferWriter`, `FakeScreen`, `FakeKeyReader`                      |
| `./types`     | Every public type                                                  |
