# Sessions

A session owns the things that outlive any one widget: who currently receives keys, whether the
alternate screen is in use, and — most importantly — putting the terminal back the way it was found.

```ts
import { startCliSession } from "@bearmetal/cli";

using session = startCliSession();
```

## You do not always need one

A bare `await cliPrompt(...)` works with no session at all. The widget opens a transient session,
uses it, and disposes it when the answer arrives. That is right for a one-off question in a script.

Start one explicitly when you have a _program_: to share a single terminal restore across a sequence
of prompts, to choose a mode, or to opt into `captureConsole`. Widgets find it through
`currentSession()`, so nothing has to be threaded through.

```ts
using session = startCliSession({ mode: "inline" });

const name = await cliPrompt("Name?"); // renders in `session`
```

Pass `session` explicitly only when you have more than one, or when a widget runs somewhere the
ambient session isn't the one you want.

## Modes

| Mode     | Behaviour                                                           |
| -------- | ------------------------------------------------------------------- |
| `inline` | Draws in place, below existing output. The default.                 |
| `alt`    | Takes over the alternate screen for the session's lifetime.         |
| `plain`  | No cursor control at all. Chosen automatically when not a terminal. |

The mode you request is honoured only when stdout is a terminal; otherwise it becomes `plain`
regardless. `session.mode` is the resolved value, so check that rather than what you asked for.

```ts
using session = startCliSession({ mode: "alt" });
if (session.mode === "plain") {
	// piped or redirected — no menus here
}
```

### Inline, and when to escalate

Inline is the default because it composes: the widget owns a block of rows, repaints it by moving
the cursor only _relative_ to where it last left it, and erases it when done. Nothing above it is
destroyed.

The alternate screen is still available, two ways:

- **Explicit** — `mode: "alt"`. Everything in the session renders there and the primary buffer comes
  back untouched. Worth choosing for a long full-screen flow, and for resize behaviour: the
  alternate screen can be repainted cleanly after a `SIGWINCH`, whereas inline output has already
  been reflowed by the terminal.
- **Automatic** — a widget whose content is taller than the terminal escalates for its own lifetime,
  rather than pushing everything above it out of view. It de-escalates when it finishes, leaving its
  summary line behind. See [`naturalHeight`](./widgets#escalation).

A menu short enough to fit never swaps the screen.

`escalate()` is refcounted for the `inline` case, so nested widgets each escalating and
de-escalating leave the screen where they found it. On a session already in `alt` mode both calls
are no-ops.

## Printing while something is live

A region tracks the rows it occupies. Writing to the terminal from anywhere else while a widget is
on screen invalidates that bookkeeping, and the next repaint smears. Inside a session, print through
the session:

```ts
session.log("still working...");
```

It erases every live region, writes, and repaints them — which is the difference between output
landing in scrollback and output being sprayed across a half-drawn menu.

Or hand the problem over wholesale:

```ts
using session = startCliSession({ captureConsole: true });
```

which routes `console.log`/`warn`/`error`/`info` through the same path for the session's lifetime.
It is off by default because patching `console` is surprising; turn it on in an application, leave
it off in a library.

Output printed _between_ widgets needs none of this. It is ordinary scrollback.

::: tip `cliLog`

`cliLog(...)` is the free-function form: it uses the ambient session if there is one and falls
through to `console.log` if there isn't. Handy in helpers that don't hold a session reference.

:::

## Interrupts and restore

```ts
startCliSession({ interrupt: "exit" }); // default
startCliSession({ interrupt: "event" });
```

`"exit"` restores the terminal and exits 130, which is what a normal CLI should do. `"event"`
cancels the focused widget instead and returns control to you — its promise rejects with
`WidgetCancelledError`. Use it when Ctrl+C should mean "back out of this question", not "quit".

The session also installs `SIGINT`/`SIGTERM` handlers, a `SIGWINCH` repaint on POSIX, and an
`unload` hook, so the terminal is restored even on paths that bypass disposal.

::: danger Do not `Deno.exit` inside the session

`using` disposal is skipped on `Deno.exit`, so raw mode and the alternate screen would survive the
process. The `unload` hook catches it as a safety net, but don't design around the net — return an
exit code and exit outside the block.

```ts
async function main(): Promise<number> {
	using session = startCliSession();
	// ...
	return 0;
}

Deno.exit(await main());
```

:::

## Not a terminal

With stdout redirected everything degrades deliberately rather than failing:

- No escape sequences are emitted at all.
- `cliPrompt` reads a line from stdin, so piped answers still work. Leftovers from a read are
  buffered, so a heredoc answering five prompts feeds five prompts — not one prompt and four
  defaults.
- Menus throw `NotInteractiveError`. There is no sensible line-based fallback for a menu, and
  silently taking the first option would be worse.
- `ArgParser` goes non-interactive: it validates what was given and reports everything missing at
  once instead of prompting.
- Colour follows `NO_COLOR`/`FORCE_COLOR`, defaulting to on only for a TTY. `setColorEnabled()`
  overrides.

### canPrompt()

`canPrompt()` is the "may I ask a question?" predicate: the session's mode when there is one, and
whether both ends are a terminal when there isn't.

```ts
import { canPrompt } from "@bearmetal/cli";

const title = canPrompt() ? await cliPrompt("Title?") : args.title;
```

Use it instead of threading your own `interactive` boolean through the program — that boolean is
this function, computed once somewhere else and then carried by hand.

Commands that cannot degrade should say so up front rather than failing at question three:

```ts
if (!canPrompt()) {
	session.log("This command needs a terminal. Pass --non-interactive with explicit flags.");
	return 1;
}
```

## API

```ts
interface CliSession {
	readonly mode: InteractiveMode;
	readonly out: TerminalWriter;
	/** Rows a widget may use before it has to escalate or window its content. */
	readonly availableRows: number;

	region(opts?: RegionOptions): Region;
	push(widget: Widget): void;
	pop(widget: Widget): void;
	log(...args: unknown[]): void;
	showCursor(): void;
	hideCursor(): void;
	escalate(): boolean;
	deescalate(): void;
	cleanup(): void;
	[Symbol.dispose](): void;
}
```

`push`/`pop` are the focus stack: the widget on top receives keys, one owner at a time. `runWidget`
handles both for you, and you should not normally call them directly.
