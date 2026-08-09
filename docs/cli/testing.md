# Testing

`@bearmetal/cli/testing` is the harness the package tests itself with. None of it needs a terminal.

```ts
import { assertEquals } from "@std/assert";
import { cliPrompt, startCliSession } from "@bearmetal/cli";
import { BufferWriter, FakeKeyReader } from "@bearmetal/cli/testing";

Deno.test("prompt collapses to a summary line", async () => {
	const out = new BufferWriter(80, 24);
	const keys = new FakeKeyReader();
	using session = startCliSession({ writer: out, reader: keys });

	const answer = cliPrompt("Name?", { session });
	keys.type("bearmetal");
	keys.press("enter");

	assertEquals(await answer, "bearmetal");
	assertEquals(out.line(0), "Name? bearmetal");
});
```

This works because a session takes both of its I/O ends as options. `writer` replaces stdout,
`reader` replaces stdin, and everything above — prompts, menus, `ArgParser`, your own widgets —
renders and reads through them without knowing.

## BufferWriter

A `TerminalWriter` backed by a fake screen that **interprets** the escape sequences it is handed:
cursor movement, line erase, scrolling. So assertions are about the rendered screen rather than a
string of control codes.

```ts
const out = new BufferWriter(80, 24);

out.lines(); // every row, trailing blanks trimmed
out.line(0); // one row
out.toString(); // the whole screen
out.raw; // every byte written, escapes included
```

`out.lines()` is the assertion you almost always want: it is what a person would see. Reach for
`raw` only when the escape sequence itself is the thing under test.

Pass `{ isTTY: false }` to test the `plain` path — the session downgrades exactly as it would with
redirected output.

## FakeKeyReader

```ts
keys.type("bearmetal"); // decodes text as a terminal would, key by key
keys.press("enter"); // one named key
keys.press("char", { char: "c", ctrl: true }); // with modifiers
keys.send(event); // a fully-formed KeyEvent
keys.sent; // everything delivered, for assertions
```

`type` runs its input through the real `KeyDecoder`, so escape sequences work as written:

```ts
keys.type("\x1b[B"); // arrow down
```

Like the real reader, it only delivers keys while something holds a claim — so a test that forgets
to start the widget fails the same way production would, rather than passing on keys nobody was
listening for.

## Ordering

Start the widget, _then_ send keys. The promise has to be pending for anything to have focus:

```ts
const answer = cliPrompt("Name?", { session }); // no await yet
keys.type("x");
keys.press("enter");
assertEquals(await answer, "x");
```

For `ArgParser.resolve()`, which moves between prompts on its own, let each one settle first:

```ts
const settled = () => new Promise<void>((r) => setTimeout(r, 0));

const resolved = parser.resolve();

await settled();
keys.type("my-app");
keys.press("enter");

await settled();
keys.press("down");
keys.press("enter");

const args = await resolved;
```

## Colour

Turn it off at the top of the file so assertions compare text rather than escapes:

```ts
import { setColorEnabled } from "@bearmetal/cli";
setColorEnabled(false);
```

## What lands where

`session.log()` writes to the real console — it is ordinary output that happens to be sequenced
around the frame. Only what a region itself draws reaches the `BufferWriter`. After a `commit` that
means just the summary line, which makes it a clean assertion:

```ts
await runProgress(session, ["one", "two"]);
assertEquals(out.lines().filter(Boolean), ["✓ 2 steps complete"]);
```

No half-erased bar, no leftover rows. If either shows up in that assertion, the region's bookkeeping
is wrong.

## keysFrom

```ts
import { keysFrom } from "@bearmetal/cli/testing";

keysFrom("\x1b[Ax"); // [{ name: "up", ... }, { name: "char", char: "x", ... }]
```

Decodes text into the key events a terminal would produce, without a reader or a session. Useful for
testing decode logic directly.
