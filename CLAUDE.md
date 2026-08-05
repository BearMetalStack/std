# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## What this is

BearMetal is a zero-dependency web stack for Deno: SSR, JSX, and TC39 Signals-based reactivity, plus
the supporting tooling (router, schema/validation, db, auth, websockets, CLI scaffolding, theming).
It is a Deno **workspace monorepo** — every top-level directory with a `deno.json` containing a
`name` is an independently versioned, independently published package, generally scoped
`@bearmetal/*`. Packages with major version `0` are early alpha; version `1` is beta. Nothing is
production-ready yet.

The workspace is declared in the root `deno.json`: `"workspace": ["./*", "./*/examples/*"]`.

## Comments

JSDoc comments are useful and should be included in the public APIs per JSR recommendations. Inline
and block comments explaining specific parts of the code are not super useful and tend to take up
space in the code. Use them sparingly. Comments used for code organization are allowed.

## Worktrees

All work happens in a dedicated git worktree and branch, never directly on the checked-out branch in
the main worktree. Open PRs via the `tea` CLI (Gitea). Use the worktree skill for the exact steps.

### Commits

This project uses conventional commits. Scope the commits specifically to the package the work was
completed in

## Commands

There is no single root test/lint/fmt task — run `deno test`, `deno fmt`, `deno lint`, `deno check`
**inside the package directory** you're working in (most packages define a `dev` task that is just
`deno test --watch`).

```bash
cd <package> && deno test              # run that package's tests
cd <package> && deno test --watch      # or: deno task dev (equivalent in most packages)
deno test path/to/file.test.ts         # single test file
deno fmt                               # root deno.json sets useTabs: true, lineWidth: 100
deno lint
```

Root-level workspace tasks (run from repo root):

```bash
deno task workspace:check              # deno check + deno lint each package in its own directory
deno task workspace:manifest           # list all packages at their current published version
deno task workspace:map-dependencies   # print the internal @bearmetal/* dependency graph
deno task workspace:bump-versions      # bump versions for packages changed since last bump
deno task workspace:publish            # bump + publish all packages to JSR, in dependency order
deno task bm:drip                      # regenerate Drip theme CSS/completions
deno task docs:dev                     # VitePress docs site (docs/)
```

`workspace:check` is the CI gate: it exits non-zero if any package fails and takes `--filter=<pkg>`
(repeatable), `--no-lint`, `--fmt`, and `--concurrency=N`. Pass these directly
(`deno task workspace:check --filter=router`) — a `--` separator would end flag parsing before the
script sees them.

Test files are colocated as `*.test.ts` (or occasionally `mod_test.ts`) next to the source they
cover — not in a separate `tests/` tree, with the exception of `webbies/tests/`. Tests use bare
`Deno.test(...)` with `@std/assert`, not a BDD framework.

Only a handful of packages currently have tests (`forge`, `router`, `miscellanea/*`,
`webbies/tests/md`) — most of the stack is still untested; don't assume coverage exists elsewhere
before relying on it.

There is no CI configured (no `.github/workflows`). Nothing enforces fmt/lint/test on push — run
them yourself.

## Cross-package dependency conventions

- Internal deps are always `jsr:@bearmetal/<pkg>` style imports, referenced by package name (see
  each package's `deno.json` `imports` map for local aliases like `@lib/`, `@fs`, `@components`).
- The workspace tooling lives in `workspace_scripts/`. `workspace.ts` is the single source of truth
  for package discovery — `discoverPackages()` expands the root `workspace` globs and keeps
  directories whose `deno.json` has a `name` under the `@bearmetal/` scope. Never re-derive that;
  every other script (`check.ts`, `dep_graph.ts`, `manifest.ts`, `version_bump.ts`,
  `publish_workspace.ts`) imports it. `run.ts` holds the subprocess and concurrency helpers.
- A package whose `deno.json` `name` is unscoped is invisible to all of this tooling. `cog/` is
  named `cog` rather than `@bearmetal/cog`, so it is never checked, versioned, or published.
- `@bearmetal/internal` (`internal/`) is `"publish": false` and, as of the `TrustedModule` change,
  **has no importers left** — `router` and `stack` used to depend on it, which would have shipped a
  dangling `jsr:@bearmetal/internal` reference to consumers (`deno publish --dry-run` does _not_
  catch this; it rewrites bare workspace specifiers into `jsr:` ones at publish time). Don't
  reintroduce a dependency on it from a published package. `publish_workspace.ts` refuses to publish
  any package that imports it.
- JSX packages set `compilerOptions.jsx: "react-jsx"` and `jsxImportSource` to either
  `@bearmetal/jsx/client` (DOM output, web components) or `@bearmetal/jsx/server` (SSR, produces
  `Html` string wrappers). Get this backwards and JSX either won't render server-side or won't
  produce real DOM nodes client-side — check the consuming package's `deno.json` before assuming
  which runtime is active.

### compilerOptions belong to the root

A package's effective config is the root `deno.json` merged with its own, key by key, the package's
winning. **`lib` is replaced wholesale, not unioned.** Workspace dependencies resolve to local
source and are type-checked under the _importing_ package's `compilerOptions`, so a package that
narrows `lib` breaks its dependencies' sources rather than its own — e.g. a `lib` without `deno.ns`
makes `Deno` undefined inside `router/` and `miscellanea/` when checked from `webbies/`.

So `lib` is defined **once, at the root**, as the union every package needs, and no package
overrides it. Packages should only set genuinely package-specific `compilerOptions` (`jsx`,
`jsxImportSource`, `types`). If you find yourself adding `lib` to a package, you are about to break
its dependents. Run `deno task workspace:check` after touching any `deno.json`.

## The reserved `/@bearmetal/*` namespace (`router/`)

Routes under `/@bearmetal/*` may only be registered by a `TrustedModule` (`router/module.ts`), an
exported abstract class whose subclass must pass a non-empty name to `super()`. `ForagerModule`
claims `@bearmetal/forager`; `stack`'s `StackComponentsModule` claims `@bearmetal/components`.

`TrustedModule` is public on purpose — **this is not a security boundary.** A module you `.use()`
already runs arbitrary code in your process and can patch `Router.prototype` directly. What the
mechanism buys is attribution and noise:

- every reserved route a trusted module takes is announced in yellow, once, at the point it is
  mounted;
- when two different classes claim the same trusted name — the impersonation signature — the router
  prints a large red alarm naming both constructors, refuses the registration, and records a
  warning;
- accumulated warnings make `router.handle` throw, so the app refuses to serve.

Warnings and trust claims bubble upward through `resolveModuleStack` when a sub-`Router` is mounted;
without that a violation below the root would never reach the `handle` check. Note `Module.use()`
only takes middleware — mounting a module is `Router.use()`.

Handlers on reserved routes are tagged with `__module` on their _deepest_ merge so the declaring
module survives bubbling; don't re-tag on every level or trust gets laundered onto whatever plain
`Module` carried it up.

## Architecture

The stack is layered; higher packages depend on lower ones. Rough dependency order (see
`deno task workspace:map-dependencies` for the live graph):

- **`miscellanea/`** — zero-dependency utility grab-bag (string case conversion, path, fs, time,
  function, object/list utils). Nearly everything else depends on this.
- **`jsx/`** — JSX runtime, split into `client` (real DOM via `document.createElement`) and `server`
  (HTML strings via an `Html` wrapper class). Both share primitives (`Html`, `escapeHtml`, `BMC`)
  from the root export.
- **`forge/`** — runtime schema validation + TypeScript inference + JSON Schema generation
  (Zod-like). `f.object()`, `.parse()`/`.safeParse()`, `Infer<T>`. Portable — used standalone or
  through router/db.
- **`router/`** — type-safe HTTP router for Deno. Core concepts: `Router` (top-level, extends
  `Module`), `Module<TState>` (composable bundle of routes/middleware/services, mountable via
  `.use()`), `Service`/`createServiceToken` (typed DI retrievable via `ctx.getService()`),
  schema-validated route bodies via forge (re-exported as `s`), typed response helpers (`Ok`,
  `Created`, `NotFound`, etc. returning `TypedResponse<T, Status>`). Almost every other server-side
  package (`app/ssr`, `db`, `auth`, `sockpuppet`) plugs into this as a `Module`.
  - Module lifecycle: `onAdopted(parent)` runs at mount time, return `false` to defer if a
    dependency isn't registered yet (retried up the tree, then once more at `ready()` — still
    failing at that point throws). `onStart()` runs once after all `onAdopted` checks pass, for
    async init like migrations.
- **`app/`** — the component framework: `BMElement` (custom element base class wiring
  signals/effects/refs/context into the Custom Elements lifecycle), `@define(tag, import.meta)`
  decorator, `app/signals` (pinned TC39 Signals polyfill), `app/context` (both call-stack-scoped
  "stack context" for SSR and DOM-tree-walking "DOM context" for components — extend via
  declaration-merging `ContextMap`), `app/ssr` (`Layout`/`Page` router middleware that renders JSX,
  scans for used custom elements, and bundles only those components' client modules into the
  response).
- **`db/`** — Postgres/KV connector exposed as a router `Module` + `Service`. See the
  **TableRegistry pattern** below — this is the one non-obvious cross-cutting mechanism in the
  codebase.
- **`den/`** — OS application directories (config/data/cache/state/logs/runtime, mapped onto XDG,
  the macOS `~/Library` layout, and the Windows roaming/local split) plus staging file handles.
  Standalone, depends only on `@std/path`. Two things to know before touching it: config discovery
  inside a `deno compile` binary searches the binary's **embedded** file system bounded at the
  `deno-compile-<name>` virtual root, never `Deno.cwd()` (walking the cwd makes a binary adopt the
  name of whatever project it was launched in), and directories it bootstraps carry a
  `.bearmetal_den` ownership marker so a collision between two apps is caught rather than silently
  shared.
- **`auth/`**, **`sockpuppet/`** (WebSocket channels), **`devproxy/`**, **`drip/`**
  (theme/stylesheet generation), **`webbies/`** (UI component library) — feature packages, each a
  router `Module` or standalone toolset following the same conventions.
- **`stack/`** — the `deno create jsr:@bearmetal/stack` scaffolding CLI/wizard that assembles a new
  app from the other packages (optional db/auth/dev-proxy modules).
- **`cli/`**, **`cog/`** — internal CLI/arg-parsing and flow-builder tooling used by `stack`'s
  wizard.

### The TableRegistry typesafety pattern (`db/`)

`@bearmetal/db` uses an open `interface TableRegistry {}` (in `db/types.d.ts`) as the canonical map
from table name string to row type. Packages that own tables extend it via declaration merging in
their own `mod.ts`:

```ts
declare module "@bearmetal/db" {
	interface TableRegistry {
		my_table: { id: string; name: string };
	}
}
```

`@bearmetal/auth` does this for `bma_users`/`bma_sessions`. This has to be an open interface (not a
generic fixed at `dbModule()` setup) because modules register their tables after the fact, from
anywhere in the dependency tree. `db/types.d.ts` also augments router's `Service<T>` with typed
`table()` overloads so `ctx.getService(dbToken).invoke("table", "my_table")` resolves to
`Queryable<TableRegistry["my_table"]>` instead of `Queryable<unknown>` — TypeScript's merge order
puts the augmented overload first, so the typed path wins over the generic one.

## Component authoring gotchas (`app/`)

These are load-bearing, non-obvious rules from `docs/NOTES.md` — violating them produces silent
bugs, not type errors:

- **`template` must be a getter, never a class field.** Class fields initialize during construction,
  before `connectedCallback`/ref registration/owner context are set up — `ref=` attributes silently
  won't register.
- **Don't wrap static `<style>` in a reactive `computed()`.** The whole fragment (including the
  stylesheet) gets torn down and rebuilt on every signal tick. Keep `template` static and push only
  the changing piece into an effect via `ref`, or bind a signal directly as a single child.
- **Keep effects surgical.** `template` should render once, on connect. Prefer `each()` for reactive
  lists (fine-grained reconciliation, tracks and disposes per-item cleanup) over a `computed()` that
  re-renders the whole tree — `replaceChildren` on every tick is a full teardown/rebuild, and naive
  array-mapping in a computed doesn't diff existing entries at all.
- **`each()` does a shallow diff.** In-place mutation of an item object won't be detected even after
  re-`.set()`ing the containing signal array — replace the object (`{...item, field: newVal}`),
  don't mutate it, unless the field itself is a signal.
- **`useShadow()` must be called synchronously inside `init()`**, ideally as the first line —
  `this.root` (used when the template fragment is appended) resolves to `shadowRoot ?? this` at the
  point `init()` returns, not later.
- Don't read `this.children` synchronously in `connectedCallback` — light-DOM children aren't parsed
  yet at that point. Use `<slot>` or a `MutationObserver`.
- `::slotted()` only reaches the top-level slotted element, not its descendants — pierce with CSS
  custom properties instead.

## Logger design (parked)

`log/design.md` documents an accepted-but-unimplemented design for a context-carrying logger
(two-tier `withContext`/`callWithContext` API built on `AsyncContext.Variable`). Read it before
implementing anything under `log/` — the sync-vs-async footgun it describes (a `using withContext()`
block must never contain an `await`, even transitively) is the central constraint the design is
built around.

## Environment variables

Every environment variable any package reads is named `BEARMETAL_<AREA>_<THING>` — `BEARMETAL_ENV`
(`miscellanea/environment.ts`), `BEARMETAL_PROXY_HOST`, `BEARMETAL_TRUST`, `BEARMETAL_DEN_APP_NAME`.
No package reads a bare, unprefixed name.

These are independently published packages that routinely run in the same process, so an unprefixed
variable is someone else's variable waiting to collide — and a user scanning their environment
should be able to tell at a glance what belongs to BearMetal. Before inventing a name, check the
current set:

```bash
grep -rhoE 'BEARMETAL_[A-Z_]+' --include='*.ts' . | sort -u
```

If a package exposes a configurable prefix (den's `envPrefix`), the **default** must still be the
`BEARMETAL_`-prefixed form; the option exists so a shipped binary can answer to its own name, not to
skip the convention.

## Exports

Every package must export a `types.ts` at its root, both as `@bearmetal/<package>/types` and
re-exported through `mod.ts`. Use the type-export skill to audit/fix this.
