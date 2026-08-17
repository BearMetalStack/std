# Manifest

A route like `/md/:file` matches an open set of URLs. The manifest names the ones that exist.

```ts
import { defineManifest } from "@bearmetal/diecast/manifest";

export default defineManifest({
	"/md/:file": {
		permutations: [
			{ params: { file: "getting-started" } },
			{ params: { file: "reactivity" } },
		],
	},
});
```

## Parameter names are type-checked

The key is a string literal, and each entry's `params` is checked against the parameters _that key_
declares. A typo is a compile error, not a 404 you find later:

```ts
defineManifest({
	"/md/:file": {
		permutations: [{ params: { flie: "intro" } }],
		//                        ^^^^
		// 'flie' does not exist in type '{ file: string; }'
	},
});
```

So is a missing one:

```ts
defineManifest({
	"/users/:id/posts/:postId": {
		permutations: [{ params: { id: "1" } }],
		// Property 'postId' is missing in type '{ id: string; }'
	},
});
```

This works through the router's own `PathParams<P>`, the same type its API contracts use.

### What the types cannot check

Whether the key names a route that actually exists. A `Router` carries no path literals in its type
— routes are strings in a `Map` — so there is nothing for TypeScript to compare against. Diecast
checks that at **build time** instead, and reports:

- a manifest key matching no registered route (`unknown-route`)
- a parameterised route with no entry (`uncovered-route`)

Both are why `defineManifest` still needs `deno task diecast build` to tell you the whole truth.

## Permutations can be computed

Most real manifests are derived from something — files on disk, a database, a content index. Pass a
function instead of an array. It may be async, and it runs once, at build time:

```ts
defineManifest({
	"/md/:file": {
		permutations: async () => {
			const posts = await loadPostIndex();
			return posts.map((p) => ({ params: { file: p.slug } }));
		},
	},
});
```

A thunk that throws is reported as a problem against its route rather than crashing the build.

## Optional parameters

`:name?` is optional, so a permutation may leave it out. The segment disappears:

```ts
defineManifest({
	"/posts/:page?": {
		permutations: [
			{ params: {} }, // -> /posts
			{ params: { page: "2" } }, // -> /posts/2
		],
	},
});
```

## Query strings need an explicit `out`

A query string has no natural file path. `/search?q=bears` cannot become a filename without
inventing a slugging scheme, and any scheme diecast picked would silently change what your URLs look
like. So you name the output yourself:

```ts
defineManifest({
	"/search": {
		permutations: [
			{ params: {}, query: { q: "bears" }, out: "search/bears/index.html" },
			{ params: {}, query: { q: "salmon" }, out: "search/salmon/index.html" },
		],
	},
});
```

Setting `query` without `out` is reported as a `missing-out` problem. `out` is relative to `outDir`
and is used verbatim — including the extension, so write `index.html` yourself if you want the
directory-index shape.

Array values repeat the key: `{ tag: ["a", "b"] }` renders `?tag=a&tag=b`.

## Manifests apply to literal routes too

An entry on a route with no parameters is not an error — it is how you generate one page per query
string, as above. When a literal route has a manifest entry, its permutations _replace_ the plain
render rather than adding to it. Give it a bare `{ params: {} }` permutation if you want the
unqueried page as well.

## Skipping

`skip: true` opts a route out and suppresses the `uncovered-route` report:

```ts
defineManifest({
	"/api/:id": { permutations: [], skip: true },
});
```

Use it for routes that serve JSON, or ones you intend to leave to
[link following](./discovery#links).

## Scaffolding one

`deno task diecast suggest` prints a `defineManifest` call covering every route that needs an entry,
with the parameter names filled in and the values blank. Paste it in and fill the values.
