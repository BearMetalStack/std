# Output

## Layout

`outputStyle` decides where a page lands. The default is `"index"`.

::: code-group

```txt [index (default)]
dist/
	index.html                     <- /
	about/index.html               <- /about
	md/getting-started/index.html  <- /md/getting-started
```

```txt [flat]
dist/
	index.html               <- /
	about.html               <- /about
	md/getting-started.html  <- /md/getting-started
```

:::

`"index"` is the default because clean URLs work on any static host with no configuration — a server
asked for `/about/` serves `about/index.html` by default. `"flat"` produces fewer directories but
needs the host to strip `.html` for you.

```ts
defineSite({ router, outDir: "dist", outputStyle: "flat" });
// or: deno task diecast build --flat
```

A URL that already names an HTML file (`/legacy/page.html`) is taken at its word under either style.

## Assets

Anything that is not `text/html` keeps its URL path verbatim, because it already carries a
meaningful extension: `/styles/site.css` becomes `styles/site.css`. An extensionless asset gets one
derived from its content type, so a `text/javascript` response at `/bundle` is written as
`bundle.js`.

## Query strings

A URL's query is part of what was rendered, so it is part of the file name. An SVG generator
programmed by its parameters is a different image per query, and a file system has nowhere to put
the `?`:

```txt
dist/
	badge.7f3c1a90e2.svg  <- /badge?label=build&value=passing
	badge.0b19d4c7aa.svg  <- /badge?label=tests&value=84
	search.5e2a8f1b03/index.html  <- /search?q=bears
```

The suffix is a digest of the query exactly as it was written, so it is the same on every build and
different for every query — including a different parameter order, since a generator may well care
about one.

You do not link to those names yourself. Diecast rewrites every reference that pointed at the query
form to the file it was written to, in each generated page and script, whether the reference was
absolute (`/badge?label=build`), relative (`../badge?label=build`), or spelled with the `&amp;` that
conforming markup requires. The report pairs them up: `url` is the URL with its query, `file` is
where it landed.

A page reached with **no** query is unaffected — `/about` is still `about/index.html`.

::: tip Manifest permutations name themselves

This is derivation for references diecast _found_. A permutation you declare with a `query` still
requires an explicit [`out`](/diecast/manifest) — you know what that page should be called, and
`search/bears/index.html` beats a digest.

:::

## Redirects

A static host has no redirect table, so a 3xx from your router cannot stay a 3xx. Diecast writes a
shim at the source path instead:

```html
<meta http-equiv="refresh" content="0; url=/new">
<link rel="canonical" href="/new">
```

The `canonical` link is there for readers that do not follow a refresh, search engines included. The
redirect is recorded in the report as a generated page.

## Failures

By default diecast **reports and continues**: every page it can build gets built, the failures are
listed, and the process exits non-zero. One broken template does not cost you the whole site.

```
failed /profile - handler threw: Cannot read properties of undefined (reading 'name')
done 42 pages, 310ms, 1 failed, 0 manifest problem(s)
```

`--strict` (or `strict: true`) stops at the first failure instead. Use it in CI when a partial site
is worse than no site.

### Seeing the real error

The router wraps its middleware chain in a `catch` that answers a bare 500. On its own that makes a
crashing template indistinguishable from a genuine failure — you would get `responded 500` and
nothing else.

Diecast registers a [`router.onError`](/router/errors) handler before it starts, which is what lets
it report `handler threw: …` with the actual message. You do not have to do anything to get this; it
is worth knowing because it explains why a diecast build tells you more about a broken page than
your dev server does.

## The report

`diecast()` returns a `GenerationReport` rather than exiting, so you can build your own tooling on
it:

```ts
const report = await diecast(router, { outDir: "dist" });

report.pages; // { url, file, status, contentType, bytes }[]
report.failures; // { url, status?, error?, message }[]
report.problems; // manifest problems, before anything rendered
report.copiedDirs; // serveDirectory mounts copied, as root prefixes
report.duration; // ms
report.ok; // no failures and no problems
```

`runDiecast` is a thin wrapper that prints this and exits with the right code.

## Concurrency

Eight pages render in parallel by default. The queue grows as it drains — a page's assets and links
are only known once it has rendered — so the pool keeps working until nothing new turns up.

```ts
defineSite({ router, outDir: "dist", concurrency: 16 });
// or: deno task diecast build --concurrency=16
```

Raise it for I/O-bound pages, lower it to `1` when you are debugging and want deterministic
ordering.

## Writing outside the output directory

Refused. A permutation whose `out` climbs out of `outDir` throws rather than writing.
