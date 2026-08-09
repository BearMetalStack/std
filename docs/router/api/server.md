# Serving a contract

`createApiModule` turns a contract plus its controllers into an ordinary [`Module`](../modules),
registered through the normal `route().get(schema, handler)` path — so mounting, path prefixes,
middleware, services, and trusted-namespace handling all behave exactly as they do for a
hand-written module.

```ts
import { createApiModule } from "@bearmetal/router/api/server";
```

::: warning Server-only entry point

Import this from a file that also runs in the browser and the bundle pulls in `Router`, `Module`,
and the `Deno` globals beneath them. The contract itself (`@bearmetal/router/api`) is the isomorphic
half.

:::

## Controllers

A controller receives the request context and returns a typed response. Its return type is pinned to
the contract's declared responses, so a status you did not declare — or the wrong payload for a
status you did — is a compile error.

```ts
export default createApiModule(api, {
	user: {
		get: (ctx) => {
			const user = findUser(ctx.params.id);
			return user ? Ok(user) : NotFound({ code: "no_such_user" });
		},
	},
});
```

Given `{ 200: User, 404: ApiError }`, the return type is
`TypedResponse<User, 200> | TypedResponse<ApiError, 404>`. That means:

```ts
Ok(user); // fine
NotFound({ code: "x" }); // fine
Ok({ id: "1" }); // error - User needs a name
NotFound(); // error - the default string body is not ApiError
Unauthorized(); // error - 401 was not declared
```

`NotFound()` failing is the useful case: the no-argument form produces a plain `"Not Found"` string,
and the contract says a 404 carries an `ApiError`, so forgetting the error body is caught rather
than shipped.

### The context

`ctx` is a [`RouterContext`](../context) with two additions:

| Property     | Type                           | Notes                                       |
| ------------ | ------------------------------ | ------------------------------------------- |
| `ctx.params` | inferred from the path literal | `{ id: string }`, not `string \| undefined` |
| `ctx.input`  | the input schema's output type | same value as `ctx.body`                    |

Everything else — `state`, `request`, `url`, `cookies`, `getService` — is unchanged, so a contract
module reads services and consumes middleware state like any other.

```ts
user: {
	get: (ctx) => {
		ctx.params.id; // string
		ctx.input; // undefined - this endpoint declares no input
		ctx.getService(dbToken); // services work normally
	},
}
```

Incoming validation is handled by the router itself, using the schema the contract registered: a
request that fails it gets `400 Bad Request` with the schema's error message, and the controller
never runs.

## Wiring controllers

### A complete map

The primary form. Every declared endpoint must appear — omitting one is a type error, which is what
makes it impossible to ship a declared endpoint with no implementation.

```ts
createApiModule(api, {
	users: { get: listUsers, post: createUser },
	user: { get: showUser },
	"/health": { get: () => Ok("healthy") }, // unnamed routes key on their path
});
```

### One at a time

For splitting controllers across files, register them individually and build with no map:

```ts
// users_controller.ts
api.users.get.setController((ctx) => Ok(listUsers(ctx.input.page)));
api.user.get.setController((ctx) => Ok(findUser(ctx.params.id)));

// server.ts
export default createApiModule(api); // throws if anything is unimplemented
```

Note the slot is `api.user.get`, not `api.user().get` — a controller serves every value of the path
parameters, so there is nothing to pass. The parenthesised form is the [client call](./client).

Completeness here is checked when the module is built rather than at compile time. The error names
every gap:

```
createApiModule: no controller for user.get, /health.get. Pass them in the
controller map or register them with setController().
```

### Both

Pass `partial: true` to combine the two, with the map taking precedence:

```ts
api.user.get.setController(defaultHandler);

createApiModule(api, { user: { get: overrideHandler } }, { partial: true });
```

## Outgoing validation

Before a response leaves, its body is validated against the schema declared for that status. A
mismatch is logged with the schema issues and turned into a `500` — the contract said the endpoint
produces a `User`, so shipping something else is a bug, not a response.

```
[api] GET /users/:id produced a 200 body that violates its own declared
schema: name: Expected string, got undefined
```

Validation is on by default and skipped when `BEARMETAL_ENV=prod`. Override it per module:

```ts
createApiModule(api, controllers, { validateResponses: false });
```

::: tip Why not `isDev()`

The gate is `environment() !== "prod"` rather than `isDev()`. `isDev()` reports `false` in a browser
and on a server started without `--allow-env`, which would silently disable validation in exactly
the two situations most likely to be hiding a real bug. Defaulting to _on_ when the signal is
missing fails safe.

:::

### Undeclared statuses

A status with no declared schema passes through untouched, with a warning when validation is on:

```
[api] GET /users/:id responded 401, which the contract does not declare -
passing through unvalidated
```

This is deliberate. Middleware legitimately produces responses the endpoint knows nothing about — an
auth layer returning `401`, a rate limiter returning `429` — and those should not be forced into
every contract that happens to sit behind them. The warning exists so an _accidental_ undeclared
status is still visible.

The client treats these as contract violations and throws; see [errors](./client#apicontracterror).

## Mounting

The result is a plain module:

```ts
const router = new Router()
	.use(authModule())
	.use("/api/v1", createApiModule(api, controllers));
```

Mounted under a prefix, the contract's paths are joined with it as usual — so remember to point the
client at the same prefix with `baseUrl`.
