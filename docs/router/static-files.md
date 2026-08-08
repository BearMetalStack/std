# Static files

`serveDirectory(dir, root, options?)` serves the contents of a directory under a URL prefix.

```ts
router.serveDirectory("./public", "/static");
// ./public/logo.svg  ->  /static/logo.svg
```

## Locating the directory

`dir` may be a path string or a `file:` URL, and the difference matters more than it looks.

A **string** is resolved against `Deno.cwd()`, so `"public"`, `"./public"`, and `"/abs/public"` keep
their usual meanings. This is what you want in development.

A **URL** is used as given, without consulting the working directory:

```ts
router.serveDirectory(new URL("./public/", import.meta.url), "/static");
```

Use the URL form — built from `import.meta.url` — when the assets belong to the module rather than
to wherever the process happened to start. It is the form that keeps working inside a `deno compile`
binary, where the embedded files live in the module graph and the cwd is whatever directory the
binary was launched from.

## Options

```ts
router.serveDirectory("./dist", "/", {
	spa: true,
	showIndex: true,
	flatten: false,
	queryable: false,
	favicon: "icon.png",
});
```

| Option      | Type                | Default | Effect                                                     |
| ----------- | ------------------- | ------- | ---------------------------------------------------------- |
| `spa`       | `boolean`           | `false` | Unmatched paths fall back to `index.html`                  |
| `showIndex` | `boolean`           | `false` | A directory path serves its `index.html`                   |
| `flatten`   | `boolean \| RegExp` | `false` | Rewrites the source directory before resolving             |
| `queryable` | `boolean`           | `false` | Adds `GET <root>/_dir` returning a JSON list of file names |
| `favicon`   | `string`            | —       | Requests for `favicon.ico` are rewritten to this file name |

### spa

Serves `index.html` for any path that does not resolve to a file, which is what a client-side router
needs to handle deep links:

```ts
router.serveDirectory("./dist", "/", { spa: true });
```

Path traversal is refused before the fallback applies, so a request for `../../etc/passwd` gets a
`404` rather than the shell. Dot segments that stay inside the directory resolve normally.

### flatten

Rewrites the directory being served, not the URLs. `true` keeps only the last path segment; a
`RegExp` strips whatever it matches. The result is taken relative to the cwd:

```ts
router.serveDirectory("./build/assets/public", "/static", { flatten: true });
// serves ./public
```

For a URL, the rewrite applies to the pathname so the option keeps the same meaning.

### queryable

Registers an extra endpoint listing the directory's immediate entries as JSON:

```ts
router.serveDirectory("./uploads", "/files", { queryable: true });
// GET /files/_dir  ->  ["a.png", "b.png"]
```

It lists one level and does not recurse. Consider whether you want the contents enumerable before
turning it on.

## Under the hood

`serveDirectory` registers an ordinary `GET` route at `<root>*`, so it participates in matching like
anything else — middleware registered above it still runs, and a more specific route declared for a
path inside the prefix takes part in the same request.

Because it is a normal route, mounting order is the only thing that decides precedence between two
overlapping static roots.
