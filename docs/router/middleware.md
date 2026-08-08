# Middleware

A middleware is just a handler that calls `next()`. There is no separate registration API and no
distinct type — `RouterHandler` covers both.

```ts
type RouterHandler<TState, TBody> = (
	ctx: RouterContext<TState, TBody>,
	next: () => Promise<Response>,
) => Promise<Response> | Response;
```

## use()

`use(handler)` on a router adds middleware that runs before every route handler.

```ts
router.use(async (ctx, next) => {
	ctx.state.requestId = crypto.randomUUID();
	return next();
});
```

`use(path, handler)` scopes it to a path pattern:

```ts
router.use("/admin", requireAdmin);
```

Middleware can also be attached to a single route through the configurator, where it runs before
that route's method handlers:

```ts
router.route("/account").use(requireAuth).get(showAccount).post(updateAccount);
```

`use()` is also how modules are mounted — see [Modules](./modules).

## The chain

Every route whose pattern matches contributes its middleware, in registration order, followed by the
handlers for the request's method. The chain always ends in a terminator that produces `404` or
`405`.

```
router.use(logger)                 ┐
router.use("/api", auth)           ├─ middleware, in registration order
router.route("/api/x").use(rate)   ┘
router.route("/api/x").get(handler)   ─ method handlers
                                      ─ terminator: 404 / 405
```

Calling `next()` passes control down. Returning a `Response` without calling `next()` short-circuits
the rest:

```ts
router.use((ctx, next) => {
	if (!ctx.cookies.get("session")) return Unauthorized();
	return next();
});
```

Because `next()` returns the downstream `Response`, middleware can act after the handler as well as
before it:

```ts
router.use(async (ctx, next) => {
	const started = performance.now();
	const response = await next();
	response.headers.set("x-elapsed", String(performance.now() - started));
	return response;
});
```

## Typing state

`ctx.state` is a plain object shared across the chain for one request. Its type is threaded through
the router's generic parameter, and there are three ways to extend it.

**Per route**, with an explicit type argument on the configurator's `use()`. Everything registered
after it on that chain sees the merged type:

```ts
router
	.route("/account")
	.use<{ user: User }>(requireAuth)
	.get((ctx) => Ok(ctx.state.user)); // ctx.state.user is User
```

**Per method**, the same way on the method itself. The state flows to later handlers on that method:

```ts
router
	.route("/posts")
	.get<{ page: number }>(parsePage, (ctx) => Ok(list(ctx.state.page)));
```

**Router-wide**, by putting the middleware in a `Module` whose `TState` declares what it adds.
Mounting the module folds that into the router's state type:

```ts
function authModule(): Module<{ user: User }> {
	return new Module<{ user: User }>()
		.use(async (ctx, next) => {
			ctx.state.user = await authenticate(ctx.request);
			return next();
		});
}

const router = new Router()
	.use(authModule()); // Router<{ user: User }>
```

This last form is the one to reach for when the state should be visible everywhere.
`router.use(handler)` with a bare function deliberately does _not_ widen the router's state type —
there is no type argument to infer it from, and silently widening on every `use()` would make the
accumulated type meaningless.

::: warning `Module.use()` erases the state type

`Module.use(handler)` returns `Module<any>`, not `Module<TState>`. Chaining directly off it loses
the module's state type:

```ts
const mod = new Module<{ db: DB }>()
	.use(logger) // Module<any> from here on
	.route("/x")
	.get((ctx) => Ok(ctx.state.db)); // ctx.state is any - no error, no completion
```

Assign the module to a typed binding first, then chain off that:

```ts
const mod: Module<{ db: DB }> = new Module<{ db: DB }>();
mod.use(logger);
mod.route("/x").get((ctx) => Ok(ctx.state.db)); // ctx.state.db is DB
```

:::

## Predicates

`isModification(ctx)` is a small helper for middleware that should only run on writes — it is true
for `POST`, `PUT`, `PATCH`, and `DELETE`.

```ts
import { isModification } from "@bearmetal/router";

router.use((ctx, next) => {
	if (isModification(ctx) && !hasCsrfToken(ctx)) return Forbidden();
	return next();
});
```

## Logging

Two built-in middleware for development:

```ts
router.logALot(); // method, path, timestamp, and status, colourized
router.logALittle(); // method and path only
```

Both take an optional boolean so a flag can switch them off in place:

```ts
router.logALot(isDev());
```

Each registers ordinary middleware, so call them before the routes you want covered.
