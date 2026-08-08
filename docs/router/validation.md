# Request validation

The router re-exports [`@bearmetal/forge`](../forge) in full, so `s`, `Infer`, and every schema
class come from `@bearmetal/router` directly. This page covers the integration points; see the forge
docs for the schema API itself.

## Schemas on routes

Pass a schema as the first argument to any method on the route configurator. The router parses and
validates before the handler runs, and the schema's inferred type flows into `ctx.body`:

```ts
import { s } from "@bearmetal/router";

const CreatePost = s.object({
	title: s.string().min(1),
	body: s.string(),
});

router.route("/posts").post(CreatePost, (ctx) => {
	ctx.body.title; // string
	ctx.body.body; // string
	return Created({ id: createPost(ctx.body) });
});
```

Validation failure returns `400 Bad Request` with the schema error message as the body; the handler
never runs. A body that is not valid JSON produces `400 Invalid request body`.

The schema argument is only available on the configurator form. The
[method shorthands](./routing#method-shorthands) (`router.post(path, handler)`) take no schema.

## Where the body comes from

The schema's **class** decides which part of the request is read — not the HTTP method:

| Schema              | Source                 | Notes                            |
| ------------------- | ---------------------- | -------------------------------- |
| `s.query({...})`    | `url.searchParams`     | result still lands on `ctx.body` |
| `s.formData({...})` | `await req.formData()` | supports `s.file()`              |
| anything else       | `await req.json()`     |                                  |

This means a `GET` with an `s.object()` schema will try to read a JSON body, and a `POST` with an
`s.query()` schema will read the query string. Match the schema to where the data actually is.

### Query strings

```ts
router.route("/search").get(
	s.query({
		q: s.string(),
		page: s.number().coerce().int().optional(),
		tag: s.array(s.string()).optional(),
	}),
	(ctx) => Ok(search(ctx.body.q, ctx.body.page, ctx.body.tag)),
);
```

Every value in a query string is a string, so any non-string field needs an explicit `.coerce()` —
`s.number()` alone will reject `"2"`. Coercion is available on `s.number()` and `s.boolean()` only.

Array fields collect repeated keys: `?tag=a&tag=b` yields `["a", "b"]`.

::: tip `ctx.query` is separate

An `s.query()` schema populates `ctx.body`. `ctx.query` stays the raw, unvalidated
`Record<string, string>` and is present on every request whether or not a schema is registered.

:::

### Form data

```ts
router.route("/upload").post(
	s.formData({
		file: s.file(),
		label: s.string(),
	}),
	(ctx) => {
		ctx.body.file; // File
		ctx.body.label; // string
		return Ok();
	},
);
```

As with query strings, a single value is unwrapped and repeated keys become an array.

## One schema per method

A route stores exactly one request schema per method, and it decides the body source. There is no
way to validate a JSON body _and_ the query string on the same endpoint — declare the query
parameters and read `ctx.url.searchParams` by hand for the other half.

Registering a second schema for the same method replaces the first.

## Response schemas

`.responds(method, schemas)` records the response shapes a route can produce, keyed by status:

```ts
router
	.route("/posts/:id")
	.get(getHandler)
	.responds("get", { 200: PostSchema, 404: ErrorSchema });
```

This is **metadata only**. It is surfaced through [`routeRegistry`](./routing#introspection) for
documentation tooling, and it does not validate anything at runtime — a handler is free to return a
body that contradicts it.

If you want the declaration enforced on both ends, declare the endpoint as an [API contract](./api/)
instead. Contracts validate outgoing bodies against the declared schema on the server and incoming
bodies on the client, and they type the handler's return value so an undeclared status is a compile
error.

## Attaching a schema to a response

Response helpers accept a schema and data as two arguments, which validates the data and attaches
the schema to the resulting `TypedResponse` for introspection:

```ts
Ok(PostSchema, post); // validates post, attaches PostSchema
```

This validates one response at one call site. It is unrelated to `.responds()`, which describes the
route rather than any particular response. See [Responses](./responses).
