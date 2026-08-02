# BearMetal Router

A simple router for Deno.

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)

## Usage

### Basics

```ts
import Router from "@bearmetal/router";

const router = new Router();

router
	.route("/users")
	.get((ctx) => {
		return new Response("GET /users");
	})
	.post((ctx) => {
		return new Response("POST /users");
	});

Deno.serve(router.handle);
```

Handlers receive a single `ctx` object:

| Property      | Type                                  | Description                                         |
| ------------- | ------------------------------------- | --------------------------------------------------- |
| `ctx.request` | `Request`                             | The incoming request                                |
| `ctx.url`     | `URL`                                 | Parsed request URL                                  |
| `ctx.params`  | `Record<string, string \| undefined>` | URL path parameters                                 |
| `ctx.state`   | `Record<string, unknown>`             | Shared mutable state across the handler chain       |
| `ctx.body`    | `string` (default) or schema output   | Parsed request body - see [Validation](#validation) |
| `ctx.query`   | `Record<string, string>`              | Raw URL query parameters, always present            |

### Middleware

```ts
router.use("/users", async (ctx, next) => {
	console.log("Executing middleware");
	return await next();
});
```

Call `next()` to pass control to the next handler in the chain. Omit it to short-circuit.

### State typing

Handlers can be typed to narrow `ctx.state` within a route:

```ts
router
	.route("/users")
	.use<{ user: User }>(async (ctx, next) => {
		ctx.state.user = await getUser(ctx.params.id);
		return next();
	})
	.get((ctx) => {
		return new Response(ctx.state.user.name);
	});
```

For router-wide state that many routes share, use [Modules](#modules).

### Modules

A Module is a reusable bundle of routes, middleware, and services. Mounting one on a router merges
its routes and automatically registers its services. The router's TypeScript state type accumulates
each module's contribution.

```ts
import { Module } from "@bearmetal/router";

interface AuthState {
	user: User;
}

function authModule(): Module<AuthState> {
	return new Module<AuthState>()
		.use(async (ctx, next) => {
			ctx.state.user = await verifyToken(ctx.request);
			return next();
		})
		.provides("auth", authService)
		.route("/auth/refresh").post(refreshHandler);
}

function dbModule(): Module<{ db: DbClient }> {
	return new Module<{ db: DbClient }>()
		.provides("db", dbService);
}

const app = new Router() // Router<{}>
	.use(authModule()) // Router<{ user: User }>
	.use(dbModule()); // Router<{ user: User; db: DbClient }>

// ctx.state.user and ctx.state.db are fully typed in all handlers below
app.route("/profile").get((ctx) => new Response(ctx.state.user.name));
```

Mount a module under a path prefix to scope its routes:

```ts
const app = new Router()
	.use("/api", apiModule());
```

Since `Router` itself is a module, nested routers work the same way:

```ts
const api = new Router();
api.route("/users").get(handler);

const app = new Router().use("/api", api);
```

#### Module API

| Method                     | Description                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.route(path)`             | Define routes (same API as `router.route()`)                                                                                              |
| `.use(handler)`            | Add middleware that runs for every route in the module                                                                                    |
| `.provides(name, service)` | Register a named service - inherited by the parent on `.use()`                                                                            |
| `.onAdopted(cb)`           | Called when the module is mounted. Return `false` to defer until a higher ancestor is available - see [Lifecycle hooks](#lifecycle-hooks) |
| `.onStart(cb)`             | Async callback run once at startup, after all modules are mounted - see [Lifecycle hooks](#lifecycle-hooks)                               |
| `.getService(name)`        | Look up a service registered on this module. Useful inside `onAdopted` - throw signals "not here yet", which pairs with `return false`    |

#### Lifecycle hooks

Modules can declare dependencies on services provided by other modules and run async initialization
before the server starts handling requests.

**`onAdopted`** fires when a module is mounted. Return `false` if a required service isn't available
yet - the callback will be retried with progressively higher ancestors as the tree is assembled, and
once more when `ready()` is called. Any callback still returning `false` at that point throws before
the server starts.

**`onStart`** runs once at startup, after all `onAdopted` checks pass. Use it for async work that
must complete before serving - migrations, cache warming, connection setup. Close over variables set
by `onAdopted` to carry context between the two hooks.

```ts
function authModule() {
	let db: Service<DbActions>;

	return new Module()
		.onAdopted((parent) => {
			try {
				db = parent.getService<DbActions>("db");
			} catch {
				return false;
			} // db not registered here yet - try a higher ancestor
		})
		.onStart(async () => {
			await db.invoke("migrate"); // db is guaranteed set by the time this runs
		});
}
```

**`router.ready()`** runs all `onAdopted` deferred checks and `onStart` callbacks. Await it before
`Deno.serve` to surface startup errors immediately:

```ts
const router = new Router()
	.use(dbModule())
	.use(authModule());

await router.ready(); // validates deps, runs migrations - errors throw here
Deno.serve(router.handle); // starts with everything already initialized
```

If you skip `router.ready()`, `handle` triggers it automatically and the first request blocks until
initialization completes. Errors in that case surface on the first request rather than at startup.

### Services

Services are typed, named dependencies that any handler can retrieve from `ctx`. They are registered
on a router directly or bundled inside a module.

#### Creating a service

```ts
import { createService, createServiceToken } from "@bearmetal/router";

const emailService = createService({
	send: async (to: string, body: string) => {/* ... */},
	verify: (address: string) => checkMx(address),
});
```

#### Registering a service

```ts
// Directly on the router
router.registerService("email", emailService);

// Or bundled inside a module (preferred - inherited automatically on .use())
function emailModule() {
	return new Module().provides("email", emailService);
}
```

#### Retrieving a service in a handler

```ts
router.route("/send").post(async (ctx) => {
	const email = ctx.getService("email");
	await email.invoke("send", "user@example.com", "Hello!");
	return Ok();
});
```

#### Typed service tokens

String names lose type information at the call site. Use `createServiceToken` to create a branded
token that carries the action types - no explicit type parameter needed on `getService`:

```ts
export const emailToken = createServiceToken<{
	send: (to: string, body: string) => Promise<void>;
	verify: (address: string) => boolean;
}>("email");

router.registerService(emailToken, emailService);

// In a handler - fully typed without type annotations:
const email = ctx.getService(emailToken);
await email.invoke("send", "user@example.com", "Hello!"); // ✓ typed
email.invoke("send", 42, "Hello!"); // ✗ type error
```

### Validation

Pass a schema as the first argument to any route method to automatically parse and validate the
request body. `ctx.body` will be typed to the schema's output. Without a schema, `ctx.body` is the
raw body as a `string`.

```ts
import { s } from "@bearmetal/router";

const CreateUser = s.object({
	name: s.string().min(1),
	email: s.string().email(),
	age: s.number().int().positive().optional(),
});

router.route("/users")
	.post(CreateUser, (ctx) => {
		const { name, email } = ctx.body; // typed as { name: string; email: string; age?: number }
		return Created({ name, email }); // auto-serialized as JSON, Content-Type set automatically
	});
```

If validation fails the router automatically returns `400 Bad Request` with a description of each
issue.

#### Schema types

| Factory              | TypeScript type  | Notes                                       |
| -------------------- | ---------------- | ------------------------------------------- |
| `s.string()`         | `string`         |                                             |
| `s.number()`         | `number`         |                                             |
| `s.boolean()`        | `boolean`        |                                             |
| `s.literal(value)`   | `typeof value`   | exact match                                 |
| `s.enum("a", "b")`   | `"a" \| "b"`     | string enum                                 |
| `s.object({ … })`    | `{ … }`          | nested schemas                              |
| `s.array(schema)`    | `T[]`            |                                             |
| `s.union(a, b)`      | `A \| B`         | first-match                                 |
| `s.optional(schema)` | `T \| undefined` | also `.optional()` on any schema            |
| `s.nullable(schema)` | `T \| null`      | also `.nullable()` on any schema            |
| `s.formData({ … })`  | `{ … }`          | parses `multipart/form-data`                |
| `s.query({ … })`     | `{ … }`          | parses URL query parameters into `ctx.body` |
| `s.file()`           | `File`           | for use inside `s.formData()`               |

#### String refinements

```ts
s.string().min(1).max(100);
s.string().email();
s.string().url();
s.string().uuid();
s.string().regex(/^\d{4}$/);
s.string().trim(); // strips whitespace before other checks
```

#### Number refinements

```ts
s.number().int();
s.number().positive();
s.number().negative();
s.number().min(0).max(100);
s.number().gt(0).lt(10); // exclusive bounds
s.number().multipleOf(5);
s.number().coerce(); // accepts "42" → 42 (useful for FormData)
```

#### Object utilities

```ts
const User = s.object({ name: s.string(), age: s.number() });

User.extend({ email: s.string() }); // add fields
User.pick("name"); // keep only listed fields
User.omit("age"); // remove listed fields
User.partial(); // make all fields optional
```

#### Query parameters

Use `s.query()` to type and validate URL query parameters. The parsed result lands in `ctx.body`
like any other schema. Use `.coerce()` on numeric and boolean fields since query values are always
strings.

`ctx.query` is always available as a raw `Record<string, string>` regardless of whether a schema is
present - useful for untyped middleware (UTM tracking, pagination defaults, etc.).

```ts
const SearchQuery = s.query({
	q: s.string().optional(),
	page: s.number().coerce().int().optional(),
	limit: s.number().coerce().int().max(100).optional(),
});

router.route("/search")
	.get(SearchQuery, (ctx) => {
		const { q, page = 1, limit = 20 } = ctx.body; // typed
		return Ok({ q, page, limit });
	});
```

#### FormData

Use `s.formData()` for `multipart/form-data` requests (file uploads, HTML forms). The router detects
this automatically and calls `req.formData()` instead of `req.json()`. Use `s.number().coerce()` or
`s.boolean().coerce()` for numeric/boolean form fields, since FormData values are always strings.

```ts
const Upload = s.formData({
	title: s.string().min(1),
	file: s.file(),
	count: s.number().coerce().int(),
	published: s.boolean().coerce(),
	tags: s.array(s.string()), // repeated form field
});

router.route("/upload")
	.post(Upload, (ctx) => {
		const { title, file, count } = ctx.body;
		return new Response(`Uploaded ${file.name}`);
	});
```

#### Type extraction

```ts
import { type Infer } from "@bearmetal/router";

const UserSchema = s.object({ name: s.string(), age: s.number() });
type User = Infer<typeof UserSchema>;
// { name: string; age: number }
```

#### Using schemas outside of routes

Schemas can be used as standalone validators anywhere:

```ts
const result = UserSchema.safeParse(unknownData);
if (result.success) {
	console.log(result.data.name); // typed
} else {
	console.error(result.issues); // [{ path: ["age"], message: "..." }]
}

// Or throw on failure:
const user = UserSchema.parse(unknownData); // throws SchemaError
```

Each schema also implements `.toJSONSchema()` which returns a JSON Schema object - this is the
foundation for future OpenAPI / Swagger documentation generation.

### Response helpers

All body-bearing response helpers return a `TypedResponse<T, Status>` - a `Response` subclass that
carries the TypeScript type of the body and the HTTP status code as literal types.

**Objects are automatically JSON-serialized** and `Content-Type: application/json` is set. Strings
produce plain text. Call with no arguments to get the default status text.

```ts
import { BadRequest, Created, NotFound, Ok } from "@bearmetal/router";

// Plain text
return Ok("hello"); // TypedResponse<string, 200>

// Auto-JSON (no manual JSON.stringify or Content-Type needed)
return Ok({ id: "123", name: "Alice" }); // TypedResponse<{ id: string; name: string }, 200>
return Created({ id: "456" }); // TypedResponse<{ id: string }, 201>
return NotFound(); // TypedResponse<string, 404> - "Not Found"

// Schema overload - validates the body and attaches the schema for documentation
return Ok(UserSchema, user); // TypedResponse<User, 200>, throws if invalid
```

All helpers follow the same four-way call pattern:

| Call form          | Body                   | Content-Type       |
| ------------------ | ---------------------- | ------------------ |
| `Ok()`             | default status text    | `text/plain`       |
| `Ok("string")`     | the string             | `text/plain`       |
| `Ok({ … })`        | `JSON.stringify(…)`    | `application/json` |
| `Ok(schema, data)` | validated + serialized | `application/json` |

#### Declaring response schemas for documentation

Use `.responds()` on the route configurator to associate response schemas with specific status
codes. This is how the future OpenAPI generator will know what each route can return.

```ts
const UserSchema = s.object({ id: s.string(), name: s.string() });
const ErrorSchema = s.object({ code: s.string(), message: s.string() });

router.route("/users/:id")
	.get(handler)
	.responds("get", { 200: UserSchema, 404: ErrorSchema });

router.route("/users")
	.post(CreateUserSchema, handler)
	.responds("post", { 201: UserSchema, 400: ErrorSchema });
```

The `.responds()` call is for documentation only - it does not validate outgoing responses at
runtime.

### Static Files

```ts
// Files from 'dirname' directory will be available at '/url-root/filename'
router.serveDirectory("dirname", "/url-root");

// Serve index.html for directory paths
router.serveDirectory("dirWithIndexHtml", "/indexes", { showIndex: true });

// SPA mode - fall back to index.html for unmatched paths
router.serveDirectory("dist", "/", { spa: true });

// A file: URL works too, and is resolved without consulting the cwd - use one
// (typically built from import.meta.url) so the assets stay reachable from a
// `deno compile` binary that embedded them
router.serveDirectory(new URL("./public/", import.meta.url), "/url-root");
```

Path strings are resolved against `Deno.cwd()`, so `'dirname'`, `'./dirname'` and `'/abs/dirname'`
all keep their usual meanings.

### File-based Routing

**Note:** _This is an experimental feature and may change in the future. Currently, JSR does not
support dynamic imports for external modules in Deno. In order to use this feature, you will need to
install as an HTTP module (available soon)._

```ts
import { FileRouter } from "@bearmetal/router";

const router = new FileRouter("dirname");
Deno.listen(router.handle);

// dirname/index.ts - accessible at '/'
export default function (ctx) {
	return new Response("Hello, world!");
}

// dirname/methods.ts - accessible at '/methods'
export const handlers = {
	get(ctx) {
		return new Response("Hello, world");
	},
	post(ctx) {
		const data = doDataOp(ctx.request.body);
		return new Response(data);
	},
};

// dirname/nestedRouter.ts - accessible at '/nestedRouter'
import Router from "@bearmetal/router";

const router = new Router();
export default router;
```
