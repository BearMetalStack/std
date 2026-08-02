# @bearmetal/router

Type-safe HTTP router for Deno with middleware, schema validation, and a composable module system.

## Quick start

```ts
import { NotFound, Ok, Router, s } from "@bearmetal/router";

const router = new Router();

router
	.route("/")
	.get((_ctx) => Ok("hello"))
	.route("/users/:id")
	.get((ctx) => {
		const id = ctx.params.id;
		return id ? Ok({ id }) : NotFound();
	});

Deno.serve(router.handle);
```

---

## Router

`Router` is the top-level entry point. It extends `Module`, so it shares the full route and
middleware API, plus a few extras for serving.

### route()

`route(path)` returns a `RouteConfigurator`, a fluent object for registering method handlers on that
path. All method calls on the configurator return the same configurator, so you can chain multiple
methods on one path.

```ts
router
	.route("/posts")
	.get(listHandler)
	.post(createHandler);

router
	.route("/posts/:id")
	.get(getHandler)
	.put(updateHandler)
	.delete(deleteHandler);
```

URL patterns follow the
[URLPattern spec](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API). Named segments
(`:id`) are available as `ctx.params.id`.

Shorthand methods `router.get(path, handler)`, `router.post(path, handler)`, etc. are equivalent to
`router.route(path).get(handler)` when you only need a single handler.

### use() :: middleware

`use(handler)` adds a middleware that runs before all route handlers. `use(path, handler)` scopes it
to a path prefix.

```ts
router.use(async (ctx, next) => {
	ctx.state.requestId = crypto.randomUUID();
	return next();
});

router.use("/admin", requireAdmin);
```

Call `next()` to pass control down the chain. Return a `Response` directly to short-circuit
remaining handlers.

### use() :: mounting modules

Passing a `Module` instance merges its routes and services into the router. The router's state type
accumulates the module's state contribution.

```ts
const router = new Router()
	.use(authModule) // Router<{ user: User }>
	.use(dbModule); // Router<{ user: User } & { db: DB }>
```

Mount a module under a path prefix:

```ts
router.use("/api/v1", apiModule);
```

Or mount at a path via the route configurator:

```ts
router.route("/auth").use(authModule);
```

### handle and ready()

`router.handle` is a `Deno.ServeHandler` suitable for passing directly to `Deno.serve`:

```ts
Deno.serve(router.handle);
```

`ready()` runs all startup callbacks and `onAdopted` dependency checks before the server starts.
Await it to surface errors at startup instead of on the first request:

```ts
await router.ready();
Deno.serve(router.handle);
```

If `ready()` is never called, `handle` invokes it automatically on the first request.

### Logging

```ts
router.logALot(); // method, path, timestamp, status code
router.logALittle(); // method and path only
```

Both accept an optional boolean to disable: `router.logALot(false)`.

### serveDirectory()

Serves static files from a directory:

```ts
router.serveDirectory("./public", "/static");

router.serveDirectory("./dist", "/", {
	spa: true, // fall back to index.html for unknown paths
	showIndex: true, // serve index.html for directory paths
	flatten: false, // serve files at their actual directory structure
	queryable: false,
});
```

The directory may be a path string or a `file:` URL. Strings are resolved against `Deno.cwd()`,
which is what you want during development. A URL is used as given, so pass one - usually built from
`import.meta.url` - when the assets should be located relative to the module rather than the working
directory:

```ts
router.serveDirectory(new URL("./public/", import.meta.url), "/static");
```

That form keeps working inside a `deno compile` binary, where the embedded files live in the module
graph and the cwd is wherever the binary was launched.

---

## RouterContext

Every handler and middleware receives a `RouterContext<TState, TBody>` as its first argument.

| Property            | Type                                  | Description                                                 |
| ------------------- | ------------------------------------- | ----------------------------------------------------------- |
| `url`               | `URL`                                 | Parsed request URL                                          |
| `params`            | `Record<string, string \| undefined>` | Named URL pattern segments                                  |
| `state`             | `TState`                              | Shared state accumulated by middleware                      |
| `request`           | `Request`                             | Raw Fetch API `Request` object                              |
| `body`              | `TBody`                               | Parsed body, `string` by default, or the schema output type |
| `query`             | `Record<string, string>`              | Raw URL query params, always available                      |
| `cookies`           | `Map<string, string>`                 | Parsed `Cookie` header                                      |
| `connection`        | `Deno.ServeHandlerInfo`               | TCP connection info                                         |
| `getService(token)` | --                                    | Look up a registered service by token or name               |

---

## Modules

`Module<TState>` is a self-contained bundle of routes, middleware, and services. Mount it on a
`Router` to merge everything in. `TState` describes what this module adds to `ctx.state` in the
parent.

```ts
import { Module } from "@bearmetal/router";

class PostsModule extends Module<{ db: DB }> {
	constructor() {
		super();
		this.route("/posts").get(this.#list.bind(this));
	}

	async #list(ctx: RouterContext<{ db: DB }>) {
		return Ok(await ctx.state.db.query("SELECT * FROM posts"));
	}
}
```

Or as a factory function:

```ts
function postsModule(): Module<{ db: DB }> {
	return new Module<{ db: DB }>()
		.route("/posts")
		.get(async (ctx) => Ok(await ctx.state.db.query("SELECT * FROM posts")));
}
```

### route() and use()

Modules have the same `route()` and `use()` as Router. `use(handler)` on a module applies only to
routes within that module.

```ts
new Module()
	.use(requireAuth)
	.route("/account").get(accountHandler);
```

### provides()

Register a service on the module so parent modules and handlers can retrieve it via
`ctx.getService()`:

```ts
import { createService, createServiceToken } from "@bearmetal/router";

const emailToken = createServiceToken<{ send: (to: string, body: string) => void }>("email");

new Module()
	.provides(
		emailToken,
		createService({
			send: (to, body) => {/* ... */},
		}),
	);
```

### onAdopted()

Called when the module is mounted on a parent. Use it to locate services registered on the parent
tree. Return `false` to defer, the callback is retried as the module tree is assembled and once more
at startup; a deferred callback that still returns `false` at startup throws immediately rather than
silently failing at request time.

```ts
new Module()
	.onAdopted((parent) => {
		try {
			this.#db = parent.getService(dbToken);
		} catch {
			return false; // db not registered yet, retry higher up
		}
	});
```

### onStart()

Registers an async callback that runs when the router's `ready()` resolves, after all modules have
been mounted. Use it for async initialization (database migrations, cache warmup, etc.).

```ts
new Module()
	.onStart(async () => {
		await db.migrate();
	});
```

---

## Services

Services are named, typed objects that handlers retrieve via `ctx.getService()`. They decouple
capability registration (in a module) from capability consumption (in any handler, at any depth).

### createServiceToken()

Creates a branded string token that carries its action types, so `ctx.getService(token)` infers the
full `Service<T>` type without a manual type parameter.

```ts
import { createServiceToken } from "@bearmetal/router";

type EmailActions = {
	send: (to: string, subject: string, body: string) => Promise<void>;
};

export const emailToken = createServiceToken<EmailActions>("email");
```

### createService()

Builds a `Service<T>` from a plain object of action functions:

```ts
import { createService } from "@bearmetal/router";

const emailService = createService<EmailActions>({
	send: async (to, subject, body) => {
		await smtp.send({ to, subject, body });
	},
});
```

### ctx.getService()

```ts
const email = ctx.getService(emailToken);
await email.invoke("send", "user@example.com", "Welcome", "...");
```

Pass a `ServiceToken<T>` for typed inference, or a plain string with an explicit type parameter.

---

## Request validation :: schemas

The router re-exports the full `@bearmetal/forge` schema library. See the forge docs for the
complete schema API. The integration points from the router's side:

Pass a schema as the first argument to any method handler. The router parses and validates the
request body before the handler runs; on failure it returns `400 Bad Request` automatically. The
schema's inferred type flows into `ctx.body`.

```ts
import { s } from "@bearmetal/router";

const CreatePost = s.object({
	title: s.string(),
	body: s.string(),
});

router.route("/posts").post(CreatePost, (ctx) => {
	ctx.body.title; // string
	ctx.body.body; // string
	return Created({ id: "..." });
});
```

Two schemas change how the body is sourced rather than just how it is validated:

**`s.query({...})`**: parses `url.searchParams` instead of the request body. The parsed result still
lands on `ctx.body`.

```ts
router.route("/search").get(
	s.query({ q: s.string(), page: s.number().int().optional() }),
	(ctx) => Ok(search(ctx.body.q, ctx.body.page)),
);
```

**`s.formData({...})`**: calls `req.formData()` instead of `req.json()`. Supports `s.file()` for
file uploads.

```ts
router.route("/upload").post(
	s.formData({ file: s.file(), label: s.string() }),
	(ctx) => {
		ctx.body.file; // File
		ctx.body.label; // string
		return Ok();
	},
);
```

Document expected response shapes with `.responds()` for OpenAPI tooling:

```ts
router
	.route("/posts")
	.get(listHandler)
	.responds("get", { 200: s.array(PostSchema), 404: s.string() });
```

---

## Response helpers

All response helpers are exported from `@bearmetal/router` and return `TypedResponse<T, S>`, a
`Response` subclass that carries the body type `T` and status code `S` as literal TypeScript types.

Pass a schema and data to attach a schema to the response (used by introspection tooling):

```ts
Ok(PostSchema, { id: "1", title: "Hello" }); // TypedResponse<Post, 200>
Ok({ id: "1" }); // TypedResponse<{ id: string }, 200>
Ok("done"); // TypedResponse<string, 200>
Ok(); // TypedResponse<string, 200>
```

**2xx**

| Helper                | Status          |
| --------------------- | --------------- |
| `Ok`                  | 200             |
| `Html(html, status?)` | 200 (or custom) |
| `Created`             | 201             |
| `Accepted`            | 202             |
| `NoContent()`         | 204             |
| `PartialContent`      | 206             |

**3xx**

| Helper                        | Status |
| ----------------------------- | ------ |
| `MovedPermanently(location)`  | 301    |
| `Found(location)`             | 302    |
| `NotModified()`               | 304    |
| `TemporaryRedirect(location)` | 307    |
| `PermanentRedirect(location)` | 308    |

**4xx**

| Helper                 | Status |
| ---------------------- | ------ |
| `BadRequest`           | 400    |
| `Unauthorized`         | 401    |
| `Forbidden`            | 403    |
| `NotFound`             | 404    |
| `MethodNotAllowed`     | 405    |
| `RequestTimeout`       | 408    |
| `Conflict`             | 409    |
| `Gone`                 | 410    |
| `ContentTooLarge`      | 413    |
| `UnsupportedMediaType` | 415    |
| `UnprocessableEntity`  | 422    |
| `TooManyRequests`      | 429    |

**5xx**

| Helper               | Status |
| -------------------- | ------ |
| `InternalError`      | 500    |
| `NotImplemented`     | 501    |
| `BadGateway`         | 502    |
| `ServiceUnavailable` | 503    |
| `GatewayTimeout`     | 504    |

---

## Forager :: dev route explorer

`ForagerModule` mounts a single GET endpoint that renders a table of all registered routes, their
methods, and their request schemas.

```ts
import { ForagerModule } from "@bearmetal/router/modules/forager";

router.use(new ForagerModule()); // serves at /_forager
router.use(new ForagerModule({ path: "/routes" })); // custom path
```

Useful during development for quickly seeing what's registered. Not intended for production
exposure.
