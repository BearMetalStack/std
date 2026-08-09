# showcase

A runnable tour of `@bearmetal/cli`. Every file is small and exists to demonstrate one layer of the
package, in the way that layer is meant to be used.

```sh
cd cli/examples/showcase

deno task start                    # no command given → pick one from a menu
deno run main.ts --help
deno run main.ts wizard
deno run main.ts --alt keys
deno run main.ts progress --steps=10
deno run main.ts palette | cat     # plain mode: no escapes at all
deno run main.ts --non-interactive scaffold --name=demo --db=kv
deno test
```

## What each file shows

| File               | Layer                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| `main.ts`          | One session for the whole run; command dispatch; exit codes instead of `Deno.exit` |
| `scaffold.ts`      | Arg defs that prompt themselves — `required`, `enum`, `confirm`, forge schemas     |
| `wizard.ts`        | The same questions by hand: `filter`, `validate`, dismissal vs. empty answer       |
| `progress.ts`      | A `Region` that isn't a widget, and printing safely alongside it                   |
| `keys.ts`          | A custom widget through `runWidget`                                                |
| `palette.ts`       | Colour, attributes, and why `displayWidth` is not `.length`                        |
| `showcase.test.ts` | Driving all of it with `BufferWriter` + `FakeKeyReader`, no terminal involved      |

## The five rules it follows

1. **One session per program.** `startCliSession()` once, in `main`, disposed with `using`.
   Everything below it — the arg parser's prompts included — picks the ambient session up
   automatically. Widgets called with no session at all still work; they open a transient one and
   throw it away, which is right for a one-off `await cliPrompt(...)` and wrong for a program.

2. **Never `Deno.exit` inside the session.** Disposal is skipped, and the terminal keeps whatever
   raw mode and alternate screen it had. Return an exit code and exit outside the block.

3. **Print through the session while anything is live.** A region tracks the rows it owns; writing
   past it desynchronises that and the next repaint smears. `session.log()` erases, prints and
   repaints. `captureConsole: true` routes `console.*` through the same path if you'd rather not
   think about it.

4. **Check the mode, don't assume a terminal.** Piped output makes the session `plain`: prompts read
   a line from stdin, menus throw `NotInteractiveError`, regions emit nothing. Commands that can't
   degrade should say so up front rather than failing at question three.

5. **Widgets don't touch stdin or the cursor.** Take keys through `runWidget`'s `onKey`, position
   the cursor in `afterRender` relative to the region. Decoding, ownership and drawing are three
   separate layers on purpose — the historical bug this package exists to fix was the decoder moving
   the cursor from inside its read loop.

## Global flags go before the command

`$root` args are the ones parsed _before_ the first positional token, so:

```sh
deno run main.ts --non-interactive scaffold --name=demo   # ✓
deno run main.ts scaffold --name=demo --non-interactive   # ✗ parsed as a scaffold arg
```

`main.ts` reads the same slice when it bootstraps `--alt`, so the rule holds everywhere.
