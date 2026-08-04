---
prev:
  text: "Loading data"
  link: "./data-loading"
next: false
---

# The Render API

`Layout()` and `Page()` cover a page in a router. Underneath them is a renderer you can call
yourself — for a fragment over a websocket, an email body, a static site build, or anything else
that wants markup out of the same components.

```ts
import { renderToString, renderToTree, serializeNode, serializeTree } from "@bearmetal/app/ssr";
```

## `renderToString(view, options?)`

Renders and returns markup. `view` is a **function** returning JSX, not JSX — the renderer opens its
scope first, then calls it.

```tsx
const html = await renderToString(() => <user-card userId="42" />, { url: "/users/42" });
```

It renders, settles every `serverInit()` and promise the tree raised, snapshots `@state`, and
serializes. The awaiting all happens here; nothing is left in flight when it resolves.

## `renderToTree(view, options?)`

The same, stopping one step short: it hands back the live tree instead of a string, for callers that
need to look at it or change it first. That is how `Page()` finds `<head>` and works out which
components the page used.

```tsx
const tree = await renderToTree(() => <my-page />, { url: ctx.request.url });
try {
	const head = tree.root.querySelector("head");
	head?.appendChild(myAnalyticsScript(tree.root.ownerDocument!));
	return new Response(serializeTree(tree.root), {
		headers: { "content-type": "text/html" },
	});
} finally {
	tree.dispose();
}
```

`tree.root` is a detached host element; its **children** are the render. The host itself is
scaffolding and is never serialized. Call `dispose()` when finished — it empties the host, which
disconnects the components in it and runs their cleanups.

| Member      | Description                                                     |
| ----------- | --------------------------------------------------------------- |
| `root`      | The host element. Its children are the rendered output.         |
| `dispose()` | Empties the host, disconnecting its components and cleaning up. |

`serializeTree(root, options?)` serializes a host's children; `serializeNode(node, options?)`
serializes one node, its own tag included.

## `RenderOptions`

| Option      | Default         | Description                                                             |
| ----------- | --------------- | ----------------------------------------------------------------------- |
| `url`       | —               | The URL this render is for. Scoped to the render; see below.            |
| `shadow`    | `"declarative"` | How shadow roots serialize: `"declarative"`, `"projected"` or `"none"`. |
| `maxPasses` | `10`            | How many settle rounds to allow before giving up and warning.           |
| `document`  | ambient         | Render into an explicit `SlagDocument` instead of the process's.        |

A path is fine for `url` — it is resolved against `http://localhost/` so relative links have
something to resolve against.

## The URL, and routing

`url` is put in call-stack context for the duration of the render, which is what lets a
[`<Router>`](/app#client-routing) anywhere in the page — including several levels down inside a
component's `template` — match the right route with nothing threaded down to it.

```tsx
router.route("/app/*").get(Page(() => <Router>{/* … */}</Router>));
```

`Page()` supplies `ctx.request.url` for you. Driving the renderer yourself, pass it:

```ts
await renderToString(() => <Router>{/* … */}</Router>, { url: ctx.request.url });
```

Call-stack scoping is sound here because a render pass is synchronous: nothing can interleave with
it, so two requests in flight never see each other's URL. The microdom's `globalThis.location` is
per-process and therefore exactly the wrong thing to route on — the router ignores it during a
render.

With no URL from either source a `<Router>` renders nothing and warns, rather than guessing `/` and
emitting the wrong page.

## The document

The first render installs the microdom over the DOM globals, once per process, if nothing else has.
Renders then share it, deliberately: a `document` is a node factory and a place to hang custom
element definitions, and each render builds its own tree under its own detached host, so there is
nothing to keep apart. Pass `document` in `RenderOptions` if you want an explicit one anyway.

Installing it early is fine too, and is what the tests do:

```ts
import { installGlobals } from "@bearmetal/slag";
installGlobals();
```

Import order does not matter either way. `@define` keeps its own list of components and registers
them against whatever registry exists, re-running when one appears — so whichever of "install the
DOM" and "import the components" happens second catches up. `BMC` likewise re-points its prototype
chain at whichever `HTMLElement` is ambient, whenever that changes.

## Telling the sides apart

`typeof document !== "undefined"` no longer answers "am I in a browser" — a server render has a
`document`, which is the whole point. Use `isBrowser()` from `@bearmetal/app`:

```ts
import { isBrowser } from "@bearmetal/app";

if (isBrowser()) globalThis.addEventListener("resize", onResize);
```

Reach for it only for things that are genuinely browser-only: attaching listeners to a document that
is about to be thrown away, patching `history`, starting timers. Rendering is not one of them — that
is supposed to be identical, and a component that branches on it has two behaviours again.

Inside the framework the equivalent question is `isServerRendering()` from `@bearmetal/jsx`, true
for the whole of a render including the gaps where it is awaiting work.

## Things to watch for

**`init()` does not run.** No listeners, no timers, no subscriptions. Anything the markup depends on
belongs in [`serverInit()`](./data-loading).

**Shadow DOM does not survive the trip.** `useShadow()` is called from `init()`, so a server render
never attaches one: the component's template lands in its light DOM, and light children handed to it
in JSX are replaced by that template rather than slotted. In the browser the element then attaches
its shadow root and renders into it, leaving the server's markup behind as stray light children. For
a component built around `<slot>`, mark it `static client = true` — the server emits its tag and its
children untouched, and the browser slots them properly on upgrade.

**Props are not markup.** Setting a declared `@prop` writes the child's signal, not an attribute, so
values handed to a component from a `Page()` view do not reach the browser. Use `serverInit()` and
`@state`; see [Loading data](./data-loading#state-is-not-prop).

**`@state` has to survive `JSON.stringify`.** A `Map`, a `Date` or a class instance does not. Derive
those in `init()` from something that does.

**Effects run when the renderer says so.** During a render the renderer flushes them itself, in
scope, and keeps going until the graph stops moving; the usual microtask scheduling stands aside.
This is the one place where a signal written from inside an effect _does_ reach its readers before
anything is read — not a second set of rules, just the browser's next microtask arriving before the
markup is serialized rather than after. Don't rely on it in code that also runs client-side.
