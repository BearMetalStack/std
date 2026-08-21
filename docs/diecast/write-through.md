# Write-through

The build-time generator renders a whole site up front. `diecastModule()` renders it a page at a
time, as real traffic arrives, writing each one to disk as it is served.

That suits a site with too many pages to enumerate, or one whose pages are expensive enough that
building them all is wasteful when most are never visited. The first visitor pays for the render;
everyone after can be served the file.

```ts
import { diecastModule } from "@bearmetal/diecast/module";

const app = new Router()
	.use(diecastModule({ outDir: "dist" }))
	.use(pages());

Deno.serve(app.handle);
```

## Mount it before the routes it should capture

::: danger Order is load-bearing

Mount it after your page routes and it silently captures nothing.

:::

The router assembles a request's middleware chain by walking every matching route **in the root's
insertion order**, taking each route's middleware then its method handlers. `diecastModule`
registers on the catch-all `/.*`, so it only sits ahead of a page handler if `/.*` was inserted
first — that is, if you mounted the module before declaring the routes.

## What gets written

By default: `200` responses with a `text/html` content type. Nothing else, because a snapshot of a
JSON API response or a 404 page is not something a static host should start serving.

```ts
diecastModule({
	outDir: "dist",
	outputStyle: "index", // same options as the build
	allContentTypes: true, // snapshot successful assets too
	ignore: ["/admin/*", "/preview/:id"],
	onError: (error, url) => console.error(`snapshot failed for ${url}`, error),
});
```

`ignore` takes path patterns (or ready-made `URLPattern`s). Reach for it before anything
user-specific or authenticated gets frozen to disk — see below.

::: warning References are not rewritten

A URL with a query is snapshotted to a file named for that query, the same as in a build — so two
queries no longer overwrite each other. But the pages were rendered by a live server and still point
at the query form: nothing rewrites them, because a page is written before the request for the thing
it references has arrived. Query-parameterised assets need the
[build](/diecast/output#query-strings), which knows the whole site before it patches anything.

:::

## Writes do not block the response

The snapshot is a side effect of serving the page and never adds latency to it. `diecastModule`
clones the response, hands the copy to the writer, and returns the original immediately without
awaiting the write.

A `Response` body is a single-use stream, which is why the clone is necessary rather than tidy —
reading the body to write it would consume the one the client is waiting for.

Because writes are not awaited, a failure has nowhere to surface on its own. Pass `onError` if you
want to know about them.

## What it does not do

- **No invalidation.** A snapshot is written once and then it is a file. Nothing notices when the
  data behind it changes. If your content mutates, either delete the file, put a real cache in front
  (`@bearmetal/cache`), or use the build-time generator on a schedule.
- **No manifest.** It captures what it is asked for; it does not enumerate anything.
- **No discovery.** Assets and links are not followed, because there is no crawl — only the page in
  front of it. A site relying on `@bearmetal/app` hydration needs its chunks served by the app
  itself, as they already are in a running server.

## Serving what it wrote

Nothing serves the snapshots automatically. Point a static host at `outDir`, or put a
`serveDirectory` ahead of your routes so a file takes precedence over re-rendering:

```ts
const app = new Router();
app.serveDirectory("dist", "/"); // serve the snapshot when it exists
app.use(diecastModule({ outDir: "dist" })); // otherwise render and snapshot it
app.use(pages());
```

## A caution on authenticated pages

The catch-all captures every HTML page it sits in front of, including ones rendered for a signed-in
user. Writing those to a directory a static host serves would expose one visitor's page to everyone.

Use `ignore` for authenticated route prefixes, or mount the module on a sub-router that only carries
public pages.
