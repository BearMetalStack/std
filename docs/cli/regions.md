# Regions

A `Region` is a block of consecutive terminal rows you own and repaint in place. It is the
repaintable frame _without_ keyboard focus — the right tool for progress bars, spinners, status
lines, and anything that updates while the program works.

```ts
using session = startCliSession();
const region = session.region();

region.render(["Building...", "  step 1 of 3"]);
region.render(["Building...", "  step 2 of 3"]);
region.commit(["✓ Built"]);
```

Widgets are built on regions too — [`runWidget`](./widgets) takes one for you. Reach for a bare
region when there is nothing to type.

## Relative movement, always

The cursor is only ever moved _relative_ to where the region last left it. Never with an absolute
`CUP`, and never after asking the terminal where the cursor is.

Both alternatives are broken in ways that only show up later. A saved absolute row goes stale the
moment anything scrolls — and something always scrolls. A device-status query has to read stdin,
which races whatever is already reading keys. Relative movement has neither problem, and that is
precisely what lets a widget render inline instead of commandeering the alternate screen.

The invariant that makes it work is one number: the region-relative row the real cursor currently
sits on. Every emission updates it; every movement is computed from it. Which is also why writing to
the terminal behind a region's back corrupts it — see
[printing while something is live](./sessions#printing-while-something-is-live).

## The three verbs

```ts
region.render(lines); // paint, replacing whatever was there
region.clear(); // erase; the region now occupies nothing
region.commit(lines); // erase, then leave `lines` behind as scrollback
```

`commit` is how an interactive widget collapses to a summary: the live frame is erased, the summary
is written as ordinary output, and the cursor ends at column 0 of a fresh row — exactly the state
`console.log` expects. That is what makes printed output and interactive widgets compose into one
readable transcript. A committed region is closed and should not be rendered again.

A shorter frame than the last one erases the rows it no longer uses; you do not have to pad.

## Sizing

```ts
region.render(lines); // throws RegionOverflowError if taller than the terminal
```

A frame taller than the terminal is a `RegionOverflowError` rather than a corrupted screen. Widgets
avoid it by windowing their content to `session.availableRows`, or by escalating to the alternate
screen — see [`naturalHeight`](./widgets#escalation).

Measure width from `session.out.columns` every frame rather than caching it: a terminal that was
resized has already told the session, and a cached width has not heard.

## Wrapping

```ts
session.region({ wrap: true });
```

Off by default, deliberately. Display width is a heuristic — emoji, ZWJ sequences and combining
marks are measured inconsistently across terminals — and a single mis-measured row desynchronises
the region's bookkeeping, which corrupts every frame after it. Truncating guarantees one row per
line and makes that failure mode impossible.

Turn wrapping on when your content is genuinely prose and the risk is acceptable.

## Cursor placement

```ts
region.cursorTo(row, col);
```

`col` is a _display_ column, so a measured width from
[`displayWidth`](./styling#measuring-styled-text) can be passed straight in. This is how a text
prompt puts the caret where the caret belongs, after the frame has been drawn — not from inside the
code that decoded the keystroke.

## After a resize

```ts
region.forget();
```

Drops the region's bookkeeping without emitting anything. The terminal has already reflowed the rows
on screen after a resize, so the recorded height no longer describes reality and rewinding over it
would corrupt whatever is now there. The next `render` starts fresh at the current cursor position.

The session does this for you on `SIGWINCH`, then asks the focused widget to repaint.

## Complete example

```ts
async function withProgress(session: CliSession, steps: string[]) {
	const region = session.region();
	session.hideCursor();
	try {
		for (const [i, step] of steps.entries()) {
			region.render([bar(i / steps.length, session.out.columns), `  ${step}`]);
			await doWork(step);
			session.log(`  ✓ ${step}`); // erases, prints, repaints
		}
		region.commit([`✓ ${steps.length} steps complete`]);
	} finally {
		if (!region.closed) region.clear(); // something threw; take the frame down
		session.showCursor();
	}
}
```

The `finally` matters. A region left on screen after an exception is a frame nothing owns any more,
and the next thing to print will land in the middle of it.
