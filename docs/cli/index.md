# @bearmetal/cli

Terminal styling, prompts, and argument parsing shared across every CLI in the stack — `stack`'s
setup wizard, the `bearmetal` tool, and anything you build with them.

```ts
import { cliConfirm, cliPrompt, selectMenuInteractive } from "@bearmetal/cli";

const name = await cliPrompt("Project name?", "my-app");
const db = await selectMenuInteractive("Database?", ["postgres", "kv"]);
const auth = await cliConfirm("Add auth?", true);
```

Each widget draws in place below whatever has already been printed, then collapses to a one-line
summary once answered. Ordinary `console.log` between prompts survives, so a wizard reads back as a
clean transcript rather than a trail of half-erased frames.

## The layers

The package is four layers with one direction of dependency. Knowing which one you are in tells you
which rules apply.

```
      ┌────────────────────────────────────────────────┐
      │ argParser/   defs → prompts → typed values     │
      └───────────────────────┬────────────────────────┘
                              │
      ┌───────────────────────▼────────────────────────┐
┌────▶│ prompts.ts / select.ts     the built-in widgets │
│     └───────────────────────┬────────────────────────┘
│                             │  runWidget()
│     ┌───────────────────────▼────────────────────────┐
│     │ render/    Session ── focus ── Region ── Writer │
└─────┤            who owns the frame, and the cursor   │
      └───────────────────────┬────────────────────────┘
                              │  KeyEvent
      ┌───────────────────────▼────────────────────────┐
      │ input/     KeyReader (stdin) ── KeyDecoder      │
      └────────────────────────────────────────────────┘
```

The split is the point. Decoding bytes, owning stdin, and drawing are three separate jobs, and they
used to be one: the thing decoding input also wrote absolute cursor-positioning escapes from inside
its read loop, on every arrow key and every character. That is why cursor placement was unreliable —
the decoder moved the cursor before the widget that owned the frame had decided anything.

Now a widget is handed keys and asked for a frame. It never reads stdin, never sets raw mode, and
never positions the cursor absolutely.

## Where to go next

| Page                        | What it covers                                            |
| --------------------------- | --------------------------------------------------------- |
| [Sessions](./sessions)      | Modes, terminal restore, the alternate screen, plain mode |
| [Prompts](./prompts)        | `cliPrompt`, `cliConfirm`, `cliAlert`, validation         |
| [Menus](./menus)            | Single and multi select                                   |
| [Regions](./regions)        | Repaintable blocks: progress, spinners, live output       |
| [Custom widgets](./widgets) | `runWidget` and the widget contract                       |
| [Argument parsing](./args)  | Defs that prompt themselves, commands, `--help`           |
| [Styling](./styling)        | Colour, attributes, and measuring styled text             |
| [Testing](./testing)        | Driving all of it without a terminal                      |

## A complete example

`cli/examples/showcase` in the repo is a runnable program that exercises every layer — arg parsing,
both prompt styles, a live region, a custom widget, styling, and the test harness. It is the fastest
way to see the shapes in one place:

```sh
cd cli/examples/showcase
deno task start
deno test
```

## The five rules

Everything else in this section is detail on one of these.

1. **One session per program.** Open it in `main`, dispose it with `using`. Everything below picks
   it up automatically.
2. **Never `Deno.exit` inside the session.** Disposal is skipped and the terminal keeps its raw mode
   and alternate screen. Return an exit code instead.
3. **Print through the session while anything is live.** `session.log()`, or `captureConsole: true`.
4. **Check the mode.** Piped output is `plain`. Prompts degrade to reading a line; menus throw.
5. **Widgets don't touch stdin or the cursor.** Keys come to you; the cursor moves relative to your
   region.
