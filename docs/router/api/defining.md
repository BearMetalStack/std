# Defining a contract

`defineApi()` starts a builder that accumulates routes — and their types — across a single chained
expression. `.route()` closes the route currently being configured and opens the next one;
`.build()` closes the last and seals the contract.

```ts
import { defineApi } from "@bearmetal/router/api";
import { s } from "@bearmetal/router";

export const api = defineApi()
	.route("/users", "users")
	.get(s.query({ page: s.number().coerce().optional() }), s.array(User))
	.post(s.object({ name: s.string() }), { 201: User, 409: ApiError })
	.route("/users/:id", "user")
	.get(undefined, { 200: User, 404: ApiError })
	.route("/health")
	.get(undefined, s.string())
	.build();
```

The whole thing has to be one expression. Types accumulate through the chain, so breaking it apart
loses them.

## route()

```ts
.route(path)
.route(path, name)
```

The name is optional and, when given, becomes a property on the contract: `api.users`, `api.user`.
Unnamed routes are reachable through `api.endpoint(path)`. Names are the more comfortable form —
they survive a path change, and they read better at call sites.

A leading slash is added if you omit one. Paths and names share a namespace and must be unique;
declaring either twice throws. A name may not be `endpoint`, `routes`, `configure`, or
`controllers`, since those would shadow the contract's own members — the type system rejects them
before the runtime check does.

## Methods

```ts
.get(input, responses)
.post(input, responses)
.put(input, responses)
.patch(input, responses)
.delete(input, responses)
.options(input, responses)
```

Both arguments are required. Pass `undefined` as `input` for an endpoint that takes none — it is
deliberately not optional, so that "no input" is something you state rather than something you
forget.

Declaring the same method twice on one route throws, as does declaring a method before any
`.route()`, or a route with no methods at all.

## Input

The input schema decides where the data travels, following the same rule the
[router](../validation#where-the-body-comes-from) already uses:

| Schema              | Client sends      | Server reads           |
| ------------------- | ----------------- | ---------------------- |
| `s.query({...})`    | search parameters | `url.searchParams`     |
| `s.formData({...})` | `FormData` body   | `await req.formData()` |
| anything else       | JSON body         | `await req.json()`     |
| `undefined`         | nothing           | —                      |

```ts
.route("/search").get(s.query({ q: s.string() }), s.array(Result))
.route("/upload").post(s.formData({ file: s.file() }), { 201: Upload })
.route("/users").post(s.object({ name: s.string() }), { 201: User })
```

Since query and form values arrive as strings, non-string fields need `.coerce()` —
`s.number().coerce()`. This applies to the client's own outgoing validation too, which checks the
encoded form rather than the object you passed, so what it validates is exactly what the server will
parse.

An endpoint takes at most one input schema, so a JSON body and validated query parameters on the
same endpoint is not expressible. That is inherited from the router, which stores one schema per
method.

## Responses

Either a bare schema, which means `200`:

```ts
.get(undefined, User) // { 200: User }
```

Or a map keyed by status:

```ts
.get(undefined, { 200: User, 404: ApiError })
```

The map is the interesting form. It becomes the union a controller is allowed to return and the
union the client's result discriminates on, so declare every status the endpoint deliberately
produces. Statuses that come from middleware rather than the endpoint itself — a `401` from an auth
layer — do not need declaring; see [undeclared statuses](./server#undeclared-statuses) for how those
behave.

Keys must be numeric and values must be forge schemas; anything else throws at build time.

## Path parameters

Parameters are inferred from the path literal, which is the one piece of typing ordinary routes
cannot do — `ctx.params` there is always `Record<string, string | undefined>`.

```ts
.route("/users/:id/posts/:postId", "post")
// ctx.params is { id: string; postId: string }
// api.post({ id, postId }) is required and checked
```

`:name` and `:name?` are recognised. An optional parameter becomes an optional property, and the
argument itself is optional when every parameter is:

| Path                    | Inferred                      | Call                               |
| ----------------------- | ----------------------------- | ---------------------------------- |
| `/health`               | none                          | `api.health()`                     |
| `/users/:id`            | `{ id: string }`              | `api.user({ id })`                 |
| `/users/:id?`           | `{ id?: string }`             | `api.user()` or `api.user({ id })` |
| `/users/:id/posts/:pid` | `{ id: string; pid: string }` | `api.post({ id, pid })`            |

Other `URLPattern` syntax — `*`, `{}?` — still routes correctly at runtime but contributes nothing
to the inferred type.

Values are percent-encoded when the client builds the path and decoded by the router on the way in,
so a parameter containing `/` or a space round-trips intact.

## Inspecting a contract

`api.routes` is the declared routes in order, each with its path, name, and a `Map` of methods to
their input and response schemas. Every schema exposes `toJSONSchema()`, which makes the contract a
reasonable starting point for generating OpenAPI:

```ts
for (const route of api.routes) {
	for (const [method, def] of route.methods) {
		def.input?.toJSONSchema();
		def.responses[200]?.toJSONSchema();
	}
}
```
