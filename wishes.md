# Wishes

Features the docs describe as if they exist. Everything answered in review has been built; what's
left below is the `Page()` bundling proposal, awaiting your design call.

---

## 1. Proposal: `Page()` bundling, and `/app` as a bundled directory

### How `Page()` actually works today

`Page()` is not broken, but it only works inside a full `@bearmetal/stack` context, and the coupling
that makes it work is invisible and unwritten:

- `Page()` inlines its entry scripts, and those entries import their shared code by a **relative**
  specifier (`../chunk-COLILIX2.js`) that resolves against the page URL, i.e. to the site root.
- `createStack` serves every emitted output at the root via its `/:script` route. That is what makes
  those imports resolve.
- The filenames line up **only because both call `buildBundle` with the same entrypoints**
  (`jsr:@bearmetal/app`, `jsr:@bearmetal/app/signals`). Chunk names are content hashes, so identical
  inputs yield identical names across two independent bundle passes.

Break any one of those three and every island silently stops hydrating. I broke it once already, by
moving chunk serving to the components endpoint and dropping the two runtime entrypoints from the
new `bundleEntrypoints`; both are restored, with the coupling now commented at both ends.

The remaining real defect is cost, not correctness: **`Page()` bundles on every request.**
`buildTagBundle(usedTags)` is called inside the handler `Page()` returns, so every page view re-runs
`Deno.bundle`.

### Yes, the shape you describe is right — with one correction

Two modes, split on whether the app follows the conventions.

**Stack mode (convention).** `/app` becomes a bundled directory alongside `/components`, with the
same preload-and-watch treatment. The difference is granularity:

|             | `/components`                           | `/app`                                                     |
| ----------- | --------------------------------------- | ---------------------------------------------------------- |
| entrypoints | one bundle (or `manifest.ts` + subsets) | **one per module**                                         |
| shipped     | always, injected into every page        | only when the component's tag appears in the rendered HTML |

Both directories go into a **single `Deno.bundle` pass**, so the `@bearmetal/app` runtime, signals,
and anything two islands share are hoisted into chunks emitted once and cached across pages. That is
the payoff: a page using one `/components` component and one `/app` island downloads the runtime
once, not twice.

`Page()` then stops bundling entirely. It scans the rendered HTML for tags — which it already does —
looks each one up in a tag→bundle map, and emits `<script type="module" src="…">`. No `Deno.bundle`
in the request path, no inlining, and chunks are real URLs that the browser caches.

**Standalone mode (explicit).** `Page(render, { entrypoint })`. The entrypoint is bundled once,
lazily, and cached. No entrypoint means no script tag and no bundling — pure SSR. This is the
non-stack escape hatch.

### The correction: don't bundle the `Page()` call site

Your instinct to land on a manual entrypoint is right, and the `import.meta`-of-the-call-site
variant is the one to reject — for a concrete reason. The call site is a _server_ module.
`views/home.tsx` imports the router, the layout, and in a real app the database. Handing that module
to the bundler drags the server graph into the client bundle. `stripServerCode` only removes named
statics (`serverRender`, `serverLoad`, `stylesheet`); it does not prune arbitrary server imports.

An explicit entrypoint lets the author point at a module that is _actually_ client-only. So:
`Page(render, { entrypoint: "./islands.ts" })`, not `Page(render, import.meta)`.

### This also kills `import.meta` on `@define`

`getComponentUrl` exists only because `Page()` needed to re-import a component it could not reach.
Once the bundler works from directories, the map can be built without it: import each module in
`/app` **one at a time** at startup, and have `@define` append its tag to a "just defined" list.
Snapshotting that list after each import yields tag→module with no `import.meta` anywhere.

`@define("my-tag")` then takes one argument. Standalone mode needs no map at all. Keep accepting and
ignoring a second argument for one version so nothing breaks on upgrade.

### The sharp edge: chunk specifiers are relative

Entry outputs reference chunks relatively, and the depth depends on where the entrypoint lives. Two
ways to stay safe, and we must pick one:

- **Serve every bundle from one flat URL directory**, so `./chunk-X.js` always resolves. Names get
  disambiguated rather than nested: `/@bearmetal/bundle/components.index`,
  `/@bearmetal/bundle/app.joke`, `/@bearmetal/bundle/chunk-X.js`. This is what the shipped
  `/components` endpoint already relies on — a nested `/@bearmetal/app/…` sibling directory _would
  break it_.
- **Or rewrite chunk specifiers to an absolute path at build time**, freeing the URL layout
  entirely. Slightly more machinery, immune to entrypoint depth, and it would have prevented the
  current bug.

I'd take the flat namespace now and the rewrite if we ever want nested URLs.

### Prod

Same names, written to disk by a build script; the server serves them statically and skips the
`onStart()` bundle. Not built yet.

### Order of work

1. Stop `Page()` bundling per request; cache the result.
2. Add `/app` as a per-module bundled directory in one pass with `/components`; flat serve
   namespace. This also dissolves the content-hash coincidence above, since there is then one bundle
   pass rather than two that have to agree by accident.
3. Move `Page()` to tag→bundle lookup + script tags.
4. Add `Page(render, { entrypoint })` for standalone.
5. Drop `import.meta` from `@define`, delete `getComponentUrl`.
6. Prod build script.

---

# Implemented

## `@prop` and declared prop types

`@prop() accessor count = 0` declares a reactive prop. The accessor reads and writes
`this.signals.$count`, the same bag SSR fills from `data-server-props`, so a prop is a signal from
the moment it exists. Declaring a prop adds it to `observedAttributes`, which is the seam a parent's
update crosses: the JSX runtime writes the attribute, `attributeChangedCallback` coerces it back to
the declared type and sets the signal.

- The type is **inferred from the initializer** (`0` → `Number`, `false` → `Boolean`, `""` →
  `String`); `@prop(Number)` overrides when the initializer can't carry it. The type is what turns
  `count="42"` back into a number, and what tells an absent boolean from an empty string.
- **`this.props` is gone**, along with `propDefs`, `clientGetProp`, `getProp`, and the `TProps` type
  parameter. Props are real fields now, so there is nothing left to proxy over. This is a deliberate
  break of documented API.
- **Objects are not observed.** They are set as properties, never attributes, so no
  `attributeChangedCallback` fires. Pass a signal if you need to watch one.
- Props **inherit correctly**: `declaredProps` merges across the constructor chain rather than
  leaning on the metadata object's prototype, since `Object.keys` would miss inherited entries and a
  subclass's `@prop` would otherwise write into its parent's declarations. Both are covered by
  tests.

`props.md` is rewritten around `@prop`, including the "String and Boolean Values" section that was
cut off, and its `next` link is closed out.

Verified: SSR still renders `app-joke` with its `data-server-props` payload after the removal.
Tests: `app/prop.test.ts` (8).

## Component directory bundling, manifests, and subset bundles

`stack/mod.ts` (`createStack`) now resolves `components/` or `src/components/`, then:

- **`manifest.ts` replaces the glob.** If present it is the sole entrypoint for the default bundle;
  otherwise a synthesized entry importing every component in the directory stands in for it.
  Verified: with a `manifest.ts` importing only `counter.tsx`, a `badge.tsx` sitting unimported in
  the same directory is absent from every served file.
- **`<subset>.manifest.ts` becomes its own bundle**, served at `/@bearmetal/components/<subset>`.
- **Every bundle is built in one `Deno.bundle` pass with code splitting on**, so anything two
  entrypoints share — the components they have in common, and the `@bearmetal/app` runtime plus
  signals that all of them pull in — is hoisted into a `chunk-*.js` emitted once. Verified: adding a
  subset dropped the default bundle from 153 KB to 295 bytes of imports, with the shared code moved
  into chunks that both entries reference.
- **Chunks are served from the same URL directory**, so the relative `import "./chunk-X.js"` inside
  each entry resolves against the endpoint. Verified: every chunk the entry imports returns 200
  `text/javascript`; an unknown bundle name 404s through to `next()`.
- The `jsr:@bearmetal/app` + signals entrypoints are still passed to the bundler, and every raw
  output is still served at the root, **because `Page()` depends on both**. See the proposal above.
  Removing them is what broke `Page()`; it is now commented at both ends so it cannot be removed by
  accident again. Cleaning it up is step 2 of the proposal, not a free tidy.
- The synthesized glob entry is named `bearmetal-components.ts`, not `index.ts`, because outputs are
  keyed by entrypoint basename and `@bearmetal/app/signals` also has an `index.ts`.
- The default bundle's script tag is injected into every HTML response; subsets are opt-in via their
  own tag, exactly as the doc shows.
- `createStack` calls `markInternal(mod)`, since the router reserves the `/@bearmetal/*` namespace.
- A missing components directory is now a no-op instead of a crash.

New in `app/ssr`: `bundleEntrypoints(entrypoints)` → `{ scripts, styles }`, keyed by output
filename. `buildBundle` is untouched, so `Page()` behaves exactly as before.

Docs updated with the directory locations, the default bundle's URL, and the chunk-sharing
guarantee.

## `getRefs()` for functional components

`getRefs()` reads the refs of the nearest owning component via `getCurrentOwner()`, which is what a
functional component lacks a `this` for. The write path already worked — `applyProps` was already
registering `ref="name"` against the owner — so this is only the read side, and string refs keep
their shape.

It returns a **live view**, not a snapshot, so it can be called before the JSX that declares the ref
is evaluated. Without an owner it warns and returns an empty view, matching `createEffect()` and
`each()`.

Per your call, the ref-name collision between two instances of the same functional component is a
documented warning rather than an API change.

## `$item={item}` removed from the docs

`lists.md` no longer tells you to pass an item to a child as a signal. In its place: put the signal
_on the item_, which `each` already supports — its shallow diff ignores the signal, and the signal
updates the node's text directly, so deep changes never force a node rebuild. That is the same
advice `docs/NOTES.md` already gives, and unlike `$item` it actually works today.

## `.bearmetal/config.ts` tag prefix removed from the docs

The commented-out promise is gone from `components/index.md`. The `my-` prefix stays hardcoded.

## `shadowTemplate` deleted

It was a `protected get` that `connectedCallback` never read.

## From the previous pass

**`@define` name normalization** — `@define("My Component")` → `my-component`,
`@define("My *very cool* Component")` → `my-very-cool-component`. Previously produced
`my-My Component`, which `customElements.define` rejects. Valid tags pass through unchanged; a tag
with no alphanumerics throws instead of silently registering something invalid.

**`init()` teardown return** — the function returned from `init()` is now registered as a cleanup
and run on disconnect, as `lifecycle.md` documents. Re-registers correctly across reconnects.

**`this.props` for undeclared props** — falls back to element property, then attribute: the inverse
of how the JSX runtime applied it. The boolean ambiguity it can't resolve is wish #1. The
server-context guard now throws an `Error` rather than a bare string.

Tests: `app/define.test.ts`, `app/BMElement.test.ts` (13 passing).
