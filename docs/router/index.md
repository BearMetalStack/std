# @bearmetal/router

A type-safe HTTP router for Deno, built on `URLPattern` and `Deno.serve`. Middleware, schema-checked
request bodies, typed responses, and a module system that lets a feature ship its routes, its
middleware, and its services as one mountable unit.

```ts
import { NotFound, Ok, Router } from "@bearmetal/router";

const router = new Router();

router
	.route("/")
	.get(() => Ok("hello"))
	.route("/users/:id")
	.get((ctx) => {
		const user = findUser(ctx.params.id);
		return user ? Ok(user) : NotFound();
	});

Deno.serve(router.handle);
```

## The shape of it

There is really only one class. `Router` extends `Module`, and everything a module can do — declare
routes, add middleware, provide services, mount other modules — a router can do too. What a router
adds is the part that talks to the outside world: `handle`, `ready()`, static file serving, request
logging.

```
              ┌─────────────────────────────────────────┐
Deno.serve ──▶│ Router                                   │
              │  ├── middleware                          │
              │  ├── routes                              │
              │  └── .use(module) ──┐                    │
              └─────────────────────┼────────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │ Module              │
                         │  ├── middleware     │
                         │  ├── routes         │
                         │  ├── services       │
                         │  └── .use(module) ──┼──▶ …and so on
                         └─────────────────────┘
```

Mounting is a merge, not a delegation. When you `.use()` a module its routes are copied into the
parent with their paths joined, its services are registered on the parent, and its state type is
folded into the parent's. At request time there is one flat route table — no per-module dispatch, no
chain of routers to walk.

A request goes through four stages:

```
Request ──▶ match ──▶ parse ──▶ middleware + handler ──▶ Response
            │         │         │
            │         │         └─ ctx.state accumulates, next() walks the chain
            │         └─ the route's schema decides body / query / formData
            └─ every matching URLPattern contributes params and middleware
```

## Two ways to declare an endpoint

Routes can be declared directly, which is what most of these pages describe:

```ts
router.route("/users/:id").get((ctx) => Ok(findUser(ctx.params.id)));
```

Or through an [API contract](./api/), which declares the path, its input schema, and its response
schemas once, then derives a typed client and a type-checked server module from that single
declaration:

```ts
const api = defineApi()
	.route("/users/:id", "user")
	.get(undefined, { 200: User, 404: ApiError })
	.build();
```

Contracts are built on top of ordinary routes and modules — a contract compiles down to a `Module`
you mount like any other. Reach for one when a browser or another service consumes the endpoint and
you would otherwise write the types twice. Use plain routes for everything else.

## Pages

| Page                                 | Covers                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| [Routing](./routing)                 | `route()`, URL patterns, method shorthands, route introspection   |
| [Middleware](./middleware)           | `use()`, the handler chain, short-circuiting, typing `ctx.state`  |
| [RouterContext](./context)           | Everything a handler receives                                     |
| [Modules](./modules)                 | Composing features, mounting, the `onAdopted`/`onStart` lifecycle |
| [Services](./services)               | Typed dependency injection across the module tree                 |
| [Request validation](./validation)   | Schemas for bodies, query strings, and form data                  |
| [Responses](./responses)             | `TypedResponse` and the status helpers                            |
| [API contracts](./api/)              | One declaration, a typed client and a typed server                |
| [Static files](./static-files)       | `serveDirectory`, SPA mode, `deno compile` compatibility          |
| [Trusted modules](./trusted-modules) | The reserved `/@bearmetal/*` namespace                            |
| [Forager](./forager)                 | The development route explorer                                    |

## Installation

```bash
deno add jsr:@bearmetal/router
```

Entry points:

| Specifier                           | Contents                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| `@bearmetal/router`                 | `Router`, `Module`, response helpers, the `s` schema builder |
| `@bearmetal/router/types`           | `RouterContext`, `RouterHandler`, `Service`, `StateType`     |
| `@bearmetal/router/response`        | The response helpers on their own                            |
| `@bearmetal/router/api`             | API contracts — isomorphic, safe to import in a browser      |
| `@bearmetal/router/api/server`      | The server half of API contracts                             |
| `@bearmetal/router/modules/forager` | The development route explorer                               |

The root export re-exports `@bearmetal/forge` in full, so `s`, `Infer`, and every schema class are
available from `@bearmetal/router` directly — you do not need to depend on forge separately.
