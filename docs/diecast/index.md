# @bearmetal/diecast

Static site generation for the BearMetal router.

## The idea

The router is already a renderer. After every `.use()` has run, a `Router` holds a single flat table
of every route in the app — sub-modules are copied into their parent at mount time, fully prefixed,
so there is no tree to walk. And `Router.handler` dispatches a `Request` to a `Response` with no
server in front of it.

Diecast puts those two facts together:

1. enumerate the route table,
2. build a `Request` for each page,
3. dispatch it through the same middleware chain a live request takes,
4. write the `Response` to disk.

Because step 3 is the real chain, a generated page is the page the app serves. There is no second
rendering path to keep in sync — your middleware, layouts, services and error handling all apply.

## Install

```sh
deno add jsr:@bearmetal/diecast
deno run -RW jsr:@bearmetal/diecast/init
```

`init` writes two files into your project.

## The two files

**`diecast.ts`** — the entry point. Your module imports diecast, not the other way round; see
[the CLI page](./cli) for why that matters.

```ts
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

This requires your app to _export_ its router rather than calling `Deno.serve` at module scope. If
it does not yet, split it:

```ts
// app.ts
export const router = new Router();
router.route("/").get(home);

// main.ts
import { router } from "./app.ts";
Deno.serve(router.handle);
```

**`diecast.manifest.ts`** — what parameterised routes should produce. Empty is fine for a site whose
routes are all literal paths.

```ts
import { defineManifest } from "@bearmetal/diecast/manifest";

export default defineManifest({
	"/md/:file": {
		permutations: () => listMarkdown().map((f) => ({ params: { file: f.slug } })),
	},
});
```

## Build it

Add a task:

```json
{
	"tasks": {
		"diecast": "deno run -A diecast.ts"
	}
}
```

```sh
deno task diecast suggest   # what generates, what needs a manifest, what is skipped
deno task diecast build     # render into dist/
```

`suggest` is the place to start on an existing app — it reads your live router and tells you exactly
which routes need an entry, then prints a manifest skeleton you can paste in.

## What you get

```
dist/
	index.html                    <- /
	about/index.html              <- /about
	md/getting-started/index.html <- /md/getting-started
	chunk-A1B2C3.js               <- pulled in by the page's inline module script
	assets/logo.svg               <- copied from a serveDirectory mount
```

Clean URLs work on any static host with no rewrite rules. See [Output](./output) to change the
layout, and [Discovery](./discovery) for how the chunks and assets get there.

## Generating as you serve

For a site too large or too slow to enumerate up front, `diecastModule()` snapshots pages to disk as
real traffic arrives. It shares the writer with the build, so the output is identical. See
[Write-through](./write-through).

## Where to go next

|                                  |                                                  |
| -------------------------------- | ------------------------------------------------ |
| [Routes](./routes)               | how each route is classified, and why            |
| [Manifest](./manifest)           | declaring pages for parameterised routes         |
| [Output](./output)               | file layout, redirects, failures                 |
| [Discovery](./discovery)         | assets, shared chunks, links, served directories |
| [CLI](./cli)                     | the entry module, flags, and the no-binary rule  |
| [Write-through](./write-through) | `diecastModule()`                                |
| [API](./api)                     | every export                                     |
