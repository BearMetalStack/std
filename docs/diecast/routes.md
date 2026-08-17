# Routes

Before it renders anything, diecast sorts every route the router registered into three buckets. What
bucket a route lands in decides whether you need to do anything about it.

```ts
import { classifyRoutes } from "@bearmetal/diecast";

for (const [path, route] of classifyRoutes(router)) {
	console.log(path, route.class, route.reason ?? "");
}
```

Or just run `deno task diecast suggest`, which prints the same thing with a manifest skeleton
attached.

## static

A literal path with a `GET` handler. Generated with no configuration.

```ts
router.route("/").get(home); // -> static
router.route("/about").get(about); // -> static
```

## needs-manifest

The path takes parameters, so it matches an open set of URLs. The router cannot say which of them
exist — only your app knows — so you declare them in [the manifest](./manifest).

```ts
router.route("/md/:file").get(page); // -> needs-manifest (file)
router.route("/users/:id/posts/:postId").get(p); // -> needs-manifest (id, postId)
```

A route in this bucket with no manifest entry is **reported as a problem**, and the build exits
non-zero. That is deliberate: silently omitting pages is the failure mode that is hardest to notice.
If a route genuinely should not be generated, say so:

```ts
export default defineManifest({
	"/api/:id": { permutations: [], skip: true },
});
```

## skip

Not a page, or deliberately excluded. `reason` says which:

| Reason                          | What it is                                                                  |
| ------------------------------- | --------------------------------------------------------------------------- |
| `middleware only`               | the route registers no HTTP method, only middleware                         |
| `no GET handler (POST)`         | a form endpoint, an API mutation                                            |
| `catch-all pattern`             | `/.*` — how `router.use(fn)` registers                                      |
| `reserved @bearmetal namespace` | Forager, drip, the components endpoint                                      |
| `served directory`              | a `serveDirectory` mount — [copied instead](./discovery#served-directories) |
| `unnameable pattern`            | a wildcard or regex group whose matches cannot be enumerated                |

### On unnameable patterns

`:name` and `:name?` are the only parameter syntax a manifest can fill in, because they are the only
ones with a name to fill. `URLPattern` also supports wildcards and inline regex, which the router
passes through untouched:

```ts
router.route("/files/*").get(f); // groups key "0"
router.route("/users/(\\d+)").get(u); // groups key "0"
```

These match perfectly well at runtime, but their groups are positional, so there is nothing for a
manifest to key on. Diecast skips them. If you want such a route generated, either give it a named
parameter (`/files/:path(.*)`) or let [link following](./discovery#links) reach it.

## Modules are already flattened

You do not enumerate a module tree. `Router.use()` copies a mounted module's routes into the parent
with their paths joined, so by the time diecast looks, everything is present at its final path:

```ts
const blog = new Module();
blog.route("/:slug").get(post);

router.use("/blog", blog);
// classifies as: /blog/:slug -> needs-manifest (slug)
```

Declare it in the manifest under `/blog/:slug`, the prefixed path — not `/:slug`.
