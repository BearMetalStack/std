# @bearmetal/diecast

Static site generation for the [BearMetal router](https://jsr.io/@bearmetal/router).

The router is already a renderer. After mounting it holds a flat table of every route in the app,
and `Router.handler` dispatches a `Request` with no server in front of it. Diecast enumerates that
table, renders each page through the same code path a live request takes, and writes the result to
disk — so a generated page is the page the app serves.

## Setup

```sh
deno run -RW jsr:@bearmetal/diecast/init
```

That writes two files. `diecast.ts` is the entry point:

```ts
import { defineSite, runDiecast } from "@bearmetal/diecast";
import { router } from "./app.ts";
import manifest from "./diecast.manifest.ts";

export const site = defineSite({ router, manifest, outDir: "dist" });

if (import.meta.main) await runDiecast(site);
```

and `diecast.manifest.ts` declares the pages that parameterised routes produce:

```ts
import { defineManifest } from "@bearmetal/diecast/manifest";

export default defineManifest({
	"/md/:file": {
		permutations: () => listMarkdown().map((f) => ({ params: { file: f.slug } })),
	},
});
```

Parameter names are checked against the literal route key, so `{ flie: … }` is a type error.

Add a task and run it:

```json
"diecast": "deno run -A diecast.ts"
```

```sh
deno task diecast suggest   # what generates, what needs a manifest, what is skipped
deno task diecast build     # render the site into dist/
```

## Why there is no global binary

A binary would have to reach your app by dynamic import, and would resolve it against _diecast's_
import map rather than yours — every bare specifier in your code would fail. So your module is the
process entry and imports diecast, not the other way round.

## Rendering as you serve

`diecastModule()` snapshots pages to disk as real traffic arrives, for sites too large or too slow
to enumerate up front. Mount it **before** the routes it should capture.

```ts
const app = new Router()
	.use(diecastModule({ outDir: "dist" }))
	.use(pages());
```

## Documentation

Full docs at [the BearMetal docs site](https://bearmetal.dev/diecast/).

## License

MIT
