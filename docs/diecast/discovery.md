# Discovery

A generated page is only servable if the things it points at were generated too. After each page
renders, diecast scans it and queues what it finds.

```ts
defineSite({
	router,
	outDir: "dist",
	discover: { assets: true, links: true, directories: true }, // all default true
});
```

## Assets

Two scans, because one is not enough.

**Attributes.** `src` and `href` on `script`, `link`, `img`, `source`, `iframe`, `embed`, `video`
and `audio`. The obvious half.

**Inline module imports.** Import specifiers inside `<script type="module">` bodies: static imports,
side-effect imports, re-exports and dynamic `import()`.

The second scan is not an optimisation. `@bearmetal/app`'s `Page()` inlines its component scripts
into the document, but deliberately does _not_ inline the bundler's shared chunks — those are pulled
in by the inlined scripts themselves, by relative specifier. They appear nowhere in any attribute.
Skip this scan and you get a site that looks perfect, serves fine, and whose custom elements never
hydrate.

::: warning Turning assets off breaks hydration

`discover.assets: false` will produce a broken `@bearmetal/app` site. The option exists for apps
that serve no bundled components at all.

:::

Off-origin references are left alone. So are `data:`, `mailto:`, bare specifiers and fragments —
things the browser will never fetch by path.

## Where a specifier resolves to

Relative specifiers resolve against **the file that was written**, not the URL the page was rendered
from. Those differ, and the difference matters.

A page rendered at `/md/intro` is written to `md/intro/index.html`, which a static host serves at
`/md/intro/`. So `./chunk.js` in that page means `/md/intro/chunk.js` — not `/md/chunk.js`, which is
what resolving against the render URL would have given. Diecast resolves against the output path so
the file lands exactly where the browser will ask for it.

### The root fallback

`@bearmetal/stack` serves shared chunks from a single-segment `/:script` route, at the site root.
That works for a page one level deep and breaks for anything deeper — the live server simply has no
route for `/md/intro/chunk-X.js`.

The file still belongs at the path the browser asks for. So when an asset fetch fails, diecast
retries at the site root and writes the result to the original nested path. The static output ends
up more robust than the server it was generated from.

In practice the bundler emits deeply-relative specifiers (`../../../../../../chunk-X.js`) alongside
shallow ones (`../chunk-X.js`). URL resolution clamps `..` at the origin root, so the deep form
lands on `/chunk-X.js` by itself; the shallow form is the one the fallback rescues.

### An asset is never HTML

The retry is not only for 404s, because a missed chunk does not always 404. From a page at
`/md/intro/`, `../chunk-X.js` resolves to `/md/chunk-X.js` — which a route like `/md/:file` happily
matches, answering `200 text/html` for a "slug" that is really a filename.

So diecast treats an HTML response to an asset request the same as a failure: retry at the root, and
if that does not produce a non-HTML response, report it. Writing the HTML would leave a document at
a `.js` path, which the page importing it cannot use and no error would ever mention.

This is also what catches a genuinely missing bundle. If your app renders `@bearmetal/app`
components but does not mount `createStack` to serve their chunks, the build fails with
`expected an asset but the route returned HTML` rather than quietly producing a site whose
components never hydrate.

## Links

With `discover.links` on, same-origin `<a href>` targets are queued as further pages. This is how a
site reaches routes you did not enumerate:

```ts
// The route is skipped in the manifest, but the index links to it,
// so it is generated anyway.
router.route("/md/:file").get(page);
```

It is on by default because a missing page is worse than an extra one. Two things to know:

- **The output set stops being fully declarative.** What gets built depends on what your pages
  happen to link to. For a reproducible build, turn it off (`--no-links`) and enumerate everything
  in the manifest.
- It will not reach a page nothing links to. Link following complements the manifest; it does not
  replace it.

## Served directories

`router.serveDirectory(dir, root)` mounts a directory behind a `"/prefix*"` wildcard. There is no
list of URLs to enumerate, so diecast copies the directory instead.

It finds them through `Router.staticMounts`, which records each mount as it is registered — the
route pattern alone says nothing about which directory is behind it.

```ts
router.serveDirectory("public", "/assets");
// -> dist/assets/... , copied recursively
```

For files served some other way, declare them:

```ts
defineSite({
	router,
	outDir: "dist",
	staticDirs: [{ dir: "./uploads", root: "/uploads" }],
});
```

A mount pointing at a directory that is not there is skipped rather than failing the build.
