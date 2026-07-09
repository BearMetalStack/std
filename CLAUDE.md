# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BearMetal is a zero-dependency web stack for Deno: SSR, JSX, and TC39 Signals-based reactivity, plus the supporting tooling (router, schema/validation, db, auth, websockets, CLI scaffolding, theming). It is a Deno **workspace monorepo** — every top-level directory with a `deno.json` containing a `name` is an independently versioned, independently published package, generally scoped `@bearmetal/*`. Packages with major version `0` are early alpha; version `1` is beta. Nothing is production-ready yet.

The workspace is declared in the root `deno.json`: `"workspace": ["./*", "./*/examples/*"]`.

## Commands

There is no single root test/lint/fmt task — run `deno test`, `deno fmt`, `deno lint`, `deno check` **inside the package directory** you're working in (most packages define a `dev` task that is just `deno test --watch`).

```bash
cd <package> && deno test              # run that package's tests
cd <package> && deno test --watch      # or: deno task dev (equivalent in most packages)
deno test path/to/file.test.ts         # single test file
deno fmt                               # root deno.json sets useTabs: true, lineWidth: 100
deno lint
```

Root-level workspace tasks (run from repo root):

```bash
deno task workspace:manifest           # list all packages at their current published version
deno task workspace:map-dependencies   # print the internal @bearmetal/* dependency graph
deno task workspace:bump-versions      # bump versions for packages changed since last bump
deno task workspace:publish            # bump + publish all packages to JSR, in dependency order
deno task bm:drip                      # regenerate Drip theme CSS/completions
deno task docs:dev                     # VitePress docs site (docs/)
```

Test files are colocated as `*.test.ts` (or occasionally `mod_test.ts`) next to the source they cover — not in a separate `tests/` tree, with the exception of `webbies/tests/`. Tests use bare `Deno.test(...)` with `@std/assert`, not a BDD framework.

Only a handful of packages currently have tests (`forge`, `router`, `miscellanea/*`, `webbies/tests/md`) — most of the stack is still untested; don't assume coverage exists elsewhere before relying on it.

There is no CI configured (no `.github/workflows`). Nothing enforces fmt/lint/test on push — run them yourself.

## Cross-package dependency conventions

- Internal deps are always `jsr:@bearmetal/<pkg>` style imports, referenced by package name (see each package's `deno.json` `imports` map for local aliases like `@lib/`, `@fs`, `@components`).
- `dep_graph.ts` / `manifest.ts` / `version_bump.ts` / `publish_workspace.ts` at the repo root implement the workspace tooling above by scanning every workspace package's `deno.json`. They identify "is this a real package" via `isPackage()` in `dep_graph.ts` (has a `deno.json` with a `name` starting with the scope `@bearmetal`).
- `@bearmetal/internal` (`internal/`) is `"publish": false` — an internal-only package (currently exposes `isInternal`/`markInternal` for marking trusted/first-party routes). It is never published to JSR; don't add public API surface to it.
- JSX packages set `compilerOptions.jsx: "react-jsx"` and `jsxImportSource` to either `@bearmetal/jsx/client` (DOM output, web components) or `@bearmetal/jsx/server` (SSR, produces `Html` string wrappers). Get this backwards and JSX either won't render server-side or won't produce real DOM nodes client-side — check the consuming package's `deno.json` before assuming which runtime is active.

## Architecture

The stack is layered; higher packages depend on lower ones. Rough dependency order (see `deno task workspace:map-dependencies` for the live graph):

- **`miscellanea/`** — zero-dependency utility grab-bag (string case conversion, path, fs, time, function, object/list utils). Nearly everything else depends on this.
- **`jsx/`** — JSX runtime, split into `client` (real DOM via `document.createElement`) and `server` (HTML strings via an `Html` wrapper class). Both share primitives (`Html`, `escapeHtml`, `BMC`) from the root export.
- **`forge/`** — runtime schema validation + TypeScript inference + JSON Schema generation (Zod-like). `f.object()`, `.parse()`/`.safeParse()`, `Infer<T>`. Portable — used standalone or through router/db.
- **`router/`** — type-safe HTTP router for Deno. Core concepts: `Router` (top-level, extends `Module`), `Module<TState>` (composable bundle of routes/middleware/services, mountable via `.use()`), `Service`/`createServiceToken` (typed DI retrievable via `ctx.getService()`), schema-validated route bodies via forge (re-exported as `s`), typed response helpers (`Ok`, `Created`, `NotFound`, etc. returning `TypedResponse<T, Status>`). Almost every other server-side package (`app/ssr`, `db`, `auth`, `sockpuppet`) plugs into this as a `Module`.
  - Module lifecycle: `onAdopted(parent)` runs at mount time, return `false` to defer if a dependency isn't registered yet (retried up the tree, then once more at `ready()` — still failing at that point throws). `onStart()` runs once after all `onAdopted` checks pass, for async init like migrations.
- **`app/`** — the component framework: `BMElement` (custom element base class wiring signals/effects/refs/context into the Custom Elements lifecycle), `@define(tag, import.meta)` decorator, `app/signals` (pinned TC39 Signals polyfill), `app/context` (both call-stack-scoped "stack context" for SSR and DOM-tree-walking "DOM context" for components — extend via declaration-merging `ContextMap`), `app/ssr` (`Layout`/`Page` router middleware that renders JSX, scans for used custom elements, and bundles only those components' client modules into the response).
- **`db/`** — Postgres/KV connector exposed as a router `Module` + `Service`. See the **TableRegistry pattern** below — this is the one non-obvious cross-cutting mechanism in the codebase.
- **`auth/`**, **`sockpuppet/`** (WebSocket channels), **`devproxy/`**, **`drip/`** (theme/stylesheet generation), **`webbies/`** (UI component library) — feature packages, each a router `Module` or standalone toolset following the same conventions.
- **`stack/`** — the `deno create jsr:@bearmetal/stack` scaffolding CLI/wizard that assembles a new app from the other packages (optional db/auth/dev-proxy modules).
- **`cli/`**, **`cog/`** — internal CLI/arg-parsing and flow-builder tooling used by `stack`'s wizard.

### The TableRegistry typesafety pattern (`db/`)

`@bearmetal/db` uses an open `interface TableRegistry {}` (in `db/types.d.ts`) as the canonical map from table name string to row type. Packages that own tables extend it via declaration merging in their own `mod.ts`:

```ts
declare module "@bearmetal/db" {
  interface TableRegistry {
    my_table: { id: string; name: string };
  }
}
```

`@bearmetal/auth` does this for `bma_users`/`bma_sessions`. This has to be an open interface (not a generic fixed at `dbModule()` setup) because modules register their tables after the fact, from anywhere in the dependency tree. `db/types.d.ts` also augments router's `Service<T>` with typed `table()` overloads so `ctx.getService(dbToken).invoke("table", "my_table")` resolves to `Queryable<TableRegistry["my_table"]>` instead of `Queryable<unknown>` — TypeScript's merge order puts the augmented overload first, so the typed path wins over the generic one.

## Component authoring gotchas (`app/`)

These are load-bearing, non-obvious rules from `docs/NOTES.md` — violating them produces silent bugs, not type errors:

- **`template` must be a getter, never a class field.** Class fields initialize during construction, before `connectedCallback`/ref registration/owner context are set up — `ref=` attributes silently won't register.
- **Don't wrap static `<style>` in a reactive `computed()`.** The whole fragment (including the stylesheet) gets torn down and rebuilt on every signal tick. Keep `template` static and push only the changing piece into an effect via `ref`, or bind a signal directly as a single child.
- **Keep effects surgical.** `template` should render once, on connect. Prefer `each()` for reactive lists (fine-grained reconciliation, tracks and disposes per-item cleanup) over a `computed()` that re-renders the whole tree — `replaceChildren` on every tick is a full teardown/rebuild, and naive array-mapping in a computed doesn't diff existing entries at all.
- **`each()` does a shallow diff.** In-place mutation of an item object won't be detected even after re-`.set()`ing the containing signal array — replace the object (`{...item, field: newVal}`), don't mutate it, unless the field itself is a signal.
- **`useShadow()` must be called synchronously inside `init()`**, ideally as the first line — `this.root` (used when the template fragment is appended) resolves to `shadowRoot ?? this` at the point `init()` returns, not later.
- Don't read `this.children` synchronously in `connectedCallback` — light-DOM children aren't parsed yet at that point. Use `<slot>` or a `MutationObserver`.
- `::slotted()` only reaches the top-level slotted element, not its descendants — pierce with CSS custom properties instead.

## Logger design (parked)

`log/design.md` documents an accepted-but-unimplemented design for a context-carrying logger (two-tier `withContext`/`callWithContext` API built on `AsyncContext.Variable`). Read it before implementing anything under `log/` — the sync-vs-async footgun it describes (a `using withContext()` block must never contain an `await`, even transitively) is the central constraint the design is built around.
