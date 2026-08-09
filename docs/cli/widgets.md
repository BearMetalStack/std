# Custom widgets

`runWidget` is the shared lifecycle every interactive widget follows: acquire a session, take a
region, decide inline-versus-alternate-screen, take keyboard focus, paint, wait for a result, then
put all of it back. `cliPrompt` and the menus are written against it, and so is anything you add.

```ts
import { runWidget } from "@bearmetal/cli";

const answer = await runWidget<string>({
	frame: () => ["Pick a letter: " + current],
	onKey: (event, ctl) => {
		if (event.name === "enter") return ctl.resolve(current);
		if (event.name === "char") current = event.char ?? "";
		ctl.rerender();
	},
});
```

## The spec

```ts
interface WidgetSpec<T> {
	/** Session to run in. Defaults to the ambient one, or a transient one. */
	session?: CliSession;
	/** Region options — notably `wrap`. */
	region?: RegionOptions;
	/** Rows the widget would use if unconstrained. */
	naturalHeight?(): number;
	/** Stays inline whatever the size. */
	neverEscalate?: boolean;
	/** Produces the current frame. */
	frame(ctl: WidgetControl<T>): string[];
	/** Handles one key. */
	onKey(event: KeyEvent, ctl: WidgetControl<T>): void;
	/** Called after the frame is painted, e.g. to position the cursor. */
	afterRender?(ctl: WidgetControl<T>): void;
	/** Called if the session tears down mid-widget. */
	onCancel?(ctl: WidgetControl<T>): void;
}
```

```ts
interface WidgetControl<T> {
	readonly session: CliSession;
	readonly region: Region;
	rerender(): void;
	resolve(value: T): void;
	reject(error: unknown): void;
}
```

## What a widget must not do

- **Don't read stdin.** Keys arrive through `onKey`. One widget holds focus at a time, and the
  session routes to it — no listener registration order to depend on.
- **Don't set raw mode.** The reader refcounts claims across the whole process; a widget toggling it
  would break whatever else holds a claim.
- **Don't move the cursor absolutely.** Use `ctl.region.cursorTo(row, col)` in `afterRender`. See
  [Regions](./regions#relative-movement-always).
- **Don't repaint on your own schedule.** Nothing repaints implicitly. Change state, then call
  `ctl.rerender()`.

## frame

`frame` returns logical lines and is called on every `rerender`. It should be a pure function of
your state — keep the state outside the spec, in the closure.

It is truncated to `session.availableRows` before painting, so returning more lines than fit is
safe, but the tail is what gets dropped. Window the content yourself if the interesting part is at
the bottom.

Frames of different heights are fine; the region erases what it no longer uses.

## Escalation

```ts
naturalHeight: () => options.length + 1,
```

`naturalHeight` is what the widget would use if unconstrained. When it exceeds `availableRows`, the
session switches to the alternate screen for this widget's lifetime — better than pushing everything
above out of view — and de-escalates when it finishes, leaving the committed summary behind.

Omit it for widgets that are always short. Pass `neverEscalate: true` to stay inline and handle the
windowing yourself.

## Finishing

`resolve` and `reject` both settle the widget exactly once; later calls are ignored. Commit the
summary line _before_ resolving, so the frame is replaced rather than left on screen:

```ts
onKey: (event, ctl) => {
	if (event.name === "enter") {
		ctl.region.commit([`${label} - ${value}`]);
		ctl.resolve(value);
	}
},
```

Use `ctl.region.clear()` instead of `commit` when a dismissal should leave no trace.

Whichever way it ends, `runWidget` pops the focus stack, de-escalates if it escalated, and releases
the transient session if it created one.

## Cancellation

If the session tears down while a widget is live — Ctrl+C with `interrupt: "event"`, or an explicit
`session.cleanup()` — `onCancel` runs and the promise rejects with `WidgetCancelledError`. Catch it
where you can act on it:

```ts
try {
	const value = await myWidget();
} catch (error) {
	if (error instanceof WidgetCancelledError) return 130;
	throw error;
}
```

## Key events

```ts
interface KeyEvent {
	name: KeyName; // "char" | "paste" | "enter" | "up" | "f1" | "unknown" | ...
	char?: string; // when name is "char"
	text?: string; // when name is "paste"
	sequence: string; // the raw bytes, as text
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
}
```

Two things about decoding are worth knowing because they change how you write handlers:

- **A paste is one event.** Bracketed paste is decoded into a single `paste` event carrying the
  whole burst, not a flood of `char` events. Handle it, or a paste into your widget does nothing.
- **Escape resolves late.** `ESC` is a prefix of every arrow and function key, so a lone Escape can
  only be recognised by the _absence_ of what would follow — about 30ms later. This is invisible in
  practice, but it is why Escape is delivered on a timer.

A chunk boundary can land in the middle of an escape sequence or a UTF-8 code point; the decoder
retains the incomplete tail for the next chunk, so you never see a half-decoded key.

## Worked example

A live key inspector, in full:

```ts
export async function keyInspector(session: CliSession): Promise<void> {
	const history: string[] = [];

	await runWidget<void>({
		session,
		naturalHeight: () => 10,

		frame: () => {
			const lines = ["Press keys. Escape quits."];
			for (const entry of history) lines.push(`  ${entry}`);
			while (lines.length < 9) lines.push(""); // fixed height: rows don't jump
			return lines;
		},

		afterRender: (ctl) => ctl.session.hideCursor(),

		onKey: (event, ctl) => {
			if (event.name === "escape") {
				ctl.region.commit([`${history.length} events seen`]);
				return ctl.resolve();
			}
			history.push(`${event.name} ${JSON.stringify(event.sequence)}`);
			if (history.length > 8) history.shift();
			ctl.rerender();
		},
	});
}
```

The runnable version is `cli/examples/showcase/keys.ts`.

## InputManager

`InputManager` is a typed `EventTarget` view of the keyboard, for passive observers:

```ts
InputManager.addEventListener("key", (event) => audit(event.detail));
```

It re-publishes decoded keys as DOM events — `key`, `char`, `paste`, `enter`, `arrow-up`, and so on.

::: warning Not for widgets

Listener order decides who sees a key first, which is exactly the coupling the focus stack exists to
remove. Take input through `runWidget` instead; use `InputManager` only for things that watch
without owning, like logging or a global hotkey.

:::
