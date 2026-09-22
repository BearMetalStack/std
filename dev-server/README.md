# @bearmetal/dev-server

[![License: MIT](https://badger.bear-metal.dev/?label=License&value=MIT&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://opensource.org/licenses/MIT)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fdev-server&valueColor=info)](https://jsr.io/@bearmetal/dev-server)

A development server for BearMetal apps and SPAs, with stylesheet hot-swapping and component hot
replacement.

```ts
import { devServerModule } from "@bearmetal/dev-server";

router.use("/app", devServerModule({ root: "client", entry: "main.tsx" }));
```

Or standalone, as the `bmdev` binary (see the package's `install` task):

```sh
bmdev client --entry=main.tsx --port=8345
```

## How it serves

Scripts are compiled **one module at a time**, not bundled. Local imports stay as imports and are
fetched back from the dev server; package imports (`@bearmetal/app`, `jsr:`, `npm:` …) are served
from a single code-split vendor build through an import map injected into every page. So every
module on the page, and every module re-imported later, shares one copy of each dependency — one
signal graph, one component registry.

With `entry` set, the server hosts an SPA: any navigation that isn't a file (a `GET` asking for
HTML, with no file extension) gets the shell — `shell`, else `index.html` in `root`, else a bare
document — with the entry injected as a module script. Leave the entry out of the shell and let the
server add it, since it knows where the module is mounted. Link other assets from the shell with
root-relative URLs that include the mount path, because the shell is served at every depth.

## Server-rendered pages

Pages rendered with `Page()` from `@bearmetal/app/ssr` get the same treatment through
`contributeHead()`: the import map, the client, and — with `entry` set — the entry module, placed at
the start of `<head>` so they precede the layout's own scripts. The entry is referenced through
`/@bearmetal/dev-server/src/…`, which serves `root` independently of where the module is mounted, so
the server can name it without a request to read the mount path from. The vendor build is prepared
before the first request, and redone before any reload that needs it.

```tsx
router.use("/client", devServerModule({ root: "client", entry: "main.ts" }));
router.route("/").get(Page(() => (
	<html>
		<head />
		<body>
			<my-counter />
		</body>
	</html>
)));
```

A component the server rendered is replaced like any other, starting from the `@state` it hydrated
with. Stylesheets the layout links from the dev server's mount are swapped in place.

`@bearmetal/stack` uses this in dev: `createStack()` serves its components directory through the dev
server rather than bundling it, and a changed component is replaced in the page and on the server.
See its docs.

## Embedding

A host that owns its own URLs can drive the dev server rather than handing it a directory:

- `root` and `entry` may be functions, resolved when the module starts (after every module mounted
  before it has started), and `entry` again before each reload.
- `mount: false` registers no catch-all; `root` is then reachable only through
  `devServerSourceUrl(path)`, which is `/@bearmetal/dev-server/src/<path>`.
- `injectEntry: false` leaves the entries out of pages, for a host that references them itself.
- `transform` runs over every compiled module and vendor file before it is served.

## What a change does

Only files the page has actually requested are considered, so editor swap files, new files nothing
imports yet and anything under `.git` are ignored. Changes are settled for 50ms and handled as a
batch.

- **A linked stylesheet** is swapped in place. The new `<link>` loads before the old one is removed,
  so nothing flashes.
- **A module that declares a component** (it contains `@define(`) and is not an entry is
  re-imported. `@bearmetal/app` builds a fresh instance of the new class for every live element of
  that tag and puts it in the old one's place, carrying `@state` and `@prop` values across.
  `#private` fields and accessors on the new class work, because every instance is built by the
  class that declared them. State held only in plain or private fields starts over.
- **Everything else** — an entry module, a module that defines no component, a package in the vendor
  build, a component whose observed attributes changed, a module that fails to re-import, HTML —
  reloads the page. So does the event stream reconnecting to a restarted server.

A module that fails to compile logs the error and leaves the page alone until it compiles again.

## Gating

`devServerModule()` returns an empty module unless `isDev()` from
`@bearmetal/miscellanea/environment` — `BEARMETAL_ENV` unset or `"dev"`, with env access granted —
so it is safe to mount unconditionally. It warns once when it disables itself. Grant
`--allow-env=BEARMETAL_ENV` if it is unexpectedly off.

## Routes

- `"*"` under its mount point, serving `root`. Mount it at a sub-path in an app with other routes,
  unless it is meant to own the whole app's routing during dev.
- `/@bearmetal/dev-server/*` for the event stream, client, vendor build and `src/`, claimed as a
  `TrustedModule` named `@bearmetal/dev-server`. Mount at most one per app.

## Bundling

Scripts are compiled by running `deno bundle` as a subprocess rather than through `Deno.bundle`, so
the dev server also works inside a compiled binary (`deno compile`, `deno desktop`), which carries
no bundler. It needs `--allow-run` for that `deno`: `BMDEV_DENO` if set (and readable), else the
running executable when it is `deno` itself, else `deno` from the `PATH`. The bundler runs from the
directory of the nearest `deno.json` above `root`, so bare specifiers resolve through the app's own
import map.

Import-map aliases that point into `root` (`"@components/": "./src/components/"`) are rewritten to
relative imports rather than vendored, and a side-effect `import "./x.css"` becomes a module that
links the stylesheet, so it is swapped in place like any other.
