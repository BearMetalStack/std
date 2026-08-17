# CLI

## Why there is no global binary

Every other CLI-ish package in the stack installs a binary. Diecast does not, and the reason is
worth stating plainly because it shapes the whole entry point.

A `diecast` binary would have to reach your app somehow. The only way is a dynamic import of a path
you hand it — and a module imported that way is resolved against **the importing process's** import
map. That process would be diecast, so your app's bare specifiers (`@bearmetal/router`, and every
alias in your own `deno.json` — `@views/`, `@lib/`, `@components`) would resolve against diecast's
map, where they do not exist. Nothing would load.

JSR compounds it: publishing wants a statically analyzable module graph, and an import of a computed
path is not one.

So the entry point is inverted. **Your module is the process entry, and it imports diecast.**
Everything resolves against your own `deno.json`, because your `deno.json` is the one in effect.

## The entry module

```ts
// diecast.ts
import { defineSite, runDiecast } from "@bearmetal/diecast";
import { router } from "./app.ts";
import manifest from "./diecast.manifest.ts";

export const site = defineSite({
	router,
	manifest,
	outDir: "dist",
});

if (import.meta.main) await runDiecast(site);
```

`deno run -RW jsr:@bearmetal/diecast/init` writes this and an empty manifest for you. It will not
overwrite files that already exist.

The `import.meta.main` guard keeps the module importable, so other tooling can pull `site` in
without triggering a build.

Then add a task:

```json
{
	"tasks": {
		"diecast": "deno run -A diecast.ts"
	}
}
```

::: tip Narrow the permissions once you know them

`-A` is convenient but broad. The build needs read and write on your project, plus whatever your own
handlers need — network for a database, env for configuration. Something like
`deno run -RWE --allow-net=localhost diecast.ts`.

:::

## Commands

```sh
deno task diecast build     # default
deno task diecast suggest
```

### build

Renders the site into `outDir` and exits `0` on success, `1` on any failure or manifest problem.

| Flag              |                                                                         |
| ----------------- | ----------------------------------------------------------------------- |
| `--out=DIR`       | override `outDir`                                                       |
| `--strict`        | stop at the first failure                                               |
| `--flat`          | `about.html` rather than `about/index.html`                             |
| `--concurrency=N` | pages rendered in parallel (default 8)                                  |
| `--no-links`      | do not follow `<a href>`                                                |
| `--no-assets`     | do not fetch referenced assets — [breaks hydration](./discovery#assets) |
| `--no-dirs`       | do not copy `serveDirectory` mounts                                     |

Flags override what `defineSite` declared.

### suggest

Reads your live router and prints how each route classifies, then a `defineManifest` skeleton for
every route that needs one:

```
Generated automatically
  /
  /about

Need manifest permutations
  /md/:file (file)

Not generated
  /submit - no GET handler (POST)
  /assets* - served directory

Manifest skeleton

import { defineManifest } from "@bearmetal/diecast/manifest";

export default defineManifest({
	"/md/:file": {
		permutations: [
			{ params: { file: "" } },
		],
	},
});
```

This is the fastest way to point diecast at an app that already exists.

## Without the CLI

`runDiecast` is a wrapper. The library call is the real interface, and it returns a report instead
of exiting:

```ts
import { diecast } from "@bearmetal/diecast";

const report = await diecast(router, { outDir: "dist", manifest });
if (!report.ok) {
	for (const f of report.failures) console.error(f.url, f.message);
	Deno.exit(1);
}
```

Use it when the build is one step of something larger — a deploy script, a test that asserts the
site builds clean, a watcher.
