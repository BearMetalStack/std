# Routing

## route()

`route(path)` returns a `RouteConfigurator` — a fluent object for registering handlers per HTTP
method. Every method call returns the same configurator, so one chain can declare a whole path, and
`route()` itself is on the configurator, so one chain can declare a whole router.

```ts
router
	.route("/posts")
	.get(listHandler)
	.post(createHandler)
	.route("/posts/:id")
	.get(getHandler)
	.put(updateHandler)
	.delete(deleteHandler);
```

The available methods are `get`, `post`, `put`, `patch`, `delete`, and `options`. Each accepts one
or more handlers; several handlers on the same method run in registration order, each deciding
whether to call `next()`.

```ts
router.route("/admin").get(requireAdmin, renderDashboard);
```

Calling `route()` twice with the same path string returns a configurator over the same underlying
route, so declarations accumulate rather than replace:

```ts
router.route("/posts").get(listHandler);
router.route("/posts").post(createHandler); // both are registered
```

## Method shorthands

For a single handler on a single method, `Router` has direct shorthands:

```ts
router.get("/health", () => Ok("ok"));
router.post("/webhook", handleWebhook);
```

Two things separate these from the configurator form. They return `void`, so they do not chain. And
they take no schema argument — [request validation](./validation) is only available through
`route()`.

Omitting the path registers the handler for every path, which is how pathless middleware is stored:

```ts
router.get(handler); // matches any path, GET only
```

## URL patterns

Paths are [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API) pathname
patterns. Named segments become `ctx.params`:

```ts
router.route("/users/:id/posts/:postId").get((ctx) => {
	ctx.params.id; // string | undefined
	ctx.params.postId; // string | undefined
});
```

`ctx.params` values are typed `string | undefined` regardless of the pattern, because the router has
no way to know at the type level which segments a given handler's pattern declares. If you want
`ctx.params` typed from the path literal, declare the route through an
[API contract](./api/defining#path-parameters), which infers it.

Values arrive percent-decoded — a request for `/chapters/Chapter%201` yields `"Chapter 1"`. A
malformed escape sequence is passed through undecoded rather than throwing.

Patterns support the full URLPattern syntax, including wildcards and optional segments:

```ts
router.route("/files/*").get(serveFile);
router.route("/posts/:id?").get(listOrShow);
```

A leading slash is added if you omit one, so `route("posts")` and `route("/posts")` are the same
route.

### Matching

Every route whose pattern matches the request URL contributes to the request, not just the first.
Their params are merged and their middleware is collected in registration order. This is what makes
a pathless `use()` and a path-scoped `use()` compose without any explicit prefix machinery.

If at least one route matched the path but none declared the request's method, the response is
`405 Method Not Allowed`. If nothing matched at all, it is `404 Not Found`. A handler that returns
something other than a `Response` without calling `next()` produces `501 Not Implemented` — the
route exists but nothing implemented it. A handler that throws produces `500 Internal Server Error`.

## absoluteRoute()

`absoluteRoute(path)` declares a route that stays anchored at the root no matter where its module is
mounted. Ordinary routes have their path joined with the mount path as they bubble up; an absolute
one skips that join, and keeps skipping it through every level.

```ts
class MetricsModule extends Module {
	constructor() {
		super();
		this.route("/stats").get(stats); // /admin/stats when mounted at /admin
		this.absoluteRoute("/metrics").get(metrics); // always /metrics
	}
}

router.use("/admin", new MetricsModule());
```

Use it for endpoints whose path is a contract with something outside your application — a health
check a load balancer polls, a webhook URL registered with a third party — where the mount point of
the module that happens to own it should not leak into the URL.

## Introspection

`routeRegistry` is a read-only view of everything registered, suitable for generating documentation:

```ts
for (const [path, entry] of router.routeRegistry) {
	entry.pattern; // URLPattern
	entry.methods; // ["GET", "POST"] - uppercase, middleware excluded
	entry.schemas; // request schema per method
	entry.responseSchemas; // response schema per method per status
}
```

It is a projection, not the live registry — mutating what it hands back does not affect routing.
[Forager](./forager) is built entirely on it, and it is the intended foundation for OpenAPI
generation.

`rawRoutes` exposes the underlying mutable configs. It exists for the router's own merge machinery;
prefer `routeRegistry` for anything else.
