# diecast smoke example

The smallest app that exercises the whole pipeline: a layout, a literal route, a parameterised route
driven by a manifest, and internal links between them.

```sh
deno task diecast suggest   # how each route classifies, plus a manifest skeleton
deno task diecast build     # render into dist/
deno task serve             # serve dist/ to check the result
```

Note how `app.ts` **exports** its router and `main.ts` does the serving. An app that calls
`Deno.serve` at module scope leaves a build with nothing it can import.

## Deliberately offline

There is no font CDN, no external stylesheet, and no client component bundle, so the build needs no
network and finishes in milliseconds.

A real app using `@bearmetal/app` custom elements needs one more thing:

```ts
router.use(createStack((s) => import(s)));
```

`Page()` inlines its component scripts but leaves their shared chunks to be fetched separately, and
`createStack` is what serves them. Without it, diecast reports the chunks as failures rather than
producing a site whose components silently never hydrate — which is the point of the check. Note
that `createStack` bundles `jsr:` entrypoints, so that build does need network access on its first
run.
