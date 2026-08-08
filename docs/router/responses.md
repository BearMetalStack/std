# Responses

Handlers return a `Response`. The router ships a set of helpers that return `TypedResponse<T, S>` —
a `Response` subclass carrying the body type `T` and the status code `S` as literal types.

```ts
import { Created, NotFound, Ok } from "@bearmetal/router";
// or, without the rest of the router:
import { Created, NotFound, Ok } from "@bearmetal/router/response";
```

## TypedResponse

```ts
class TypedResponse<T = unknown, S extends number = number> extends Response {
	readonly schema?: Schema<T>;
	declare readonly status: S; // narrowed from Response's `number`
}
```

The literal status is what makes `Ok(user)` distinguishable from `NotFound(err)` at the type level.
It is the mechanism [API contracts](./api/server#controllers) use to check a controller against its
declared responses, and it is what lets a client discriminate a result union on `.status`.

The body is serialized on construction:

| Value                | Body             | Content-Type               |
| -------------------- | ---------------- | -------------------------- |
| `null` / `undefined` | none             | not set                    |
| `string`             | as-is            | `text/plain;charset=UTF-8` |
| `object`             | `JSON.stringify` | `application/json`         |
| anything else        | `String(value)`  | `text/plain;charset=UTF-8` |

Content-Type is only set if not already present, so an explicit header wins.

## Calling the helpers

Each body-bearing helper has four forms:

```ts
Ok(); // TypedResponse<string, 200>       - default body, "OK"
Ok("done"); // TypedResponse<string, 200>       - text body
Ok({ id: "1" }); // TypedResponse<{id: string}, 200> - JSON body
Ok(PostSchema, post); // TypedResponse<Post, 200>         - validated, schema attached
```

The two-argument form runs `schema.parse(data)` and stores the schema on the response, where
introspection tooling can find it. It throws `SchemaError` if the data does not match — which,
uncaught in a handler, becomes a `500`.

A `Headers` instance may be passed as the last argument to set response headers:

```ts
Ok({ id: "1" }, new Headers({ "cache-control": "no-store" }));
```

## The helpers

**2xx**

| Helper                | Status          |
| --------------------- | --------------- |
| `Ok`                  | 200             |
| `Html(html, status?)` | 200 (or custom) |
| `Script(js)`          | 200             |
| `Style(css)`          | 200             |
| `Created`             | 201             |
| `Accepted`            | 202             |
| `NoContent()`         | 204             |
| `PartialContent`      | 206             |

`Html`, `Script`, and `Style` take a pre-rendered string and set the matching content type.

**3xx**

| Helper                        | Status |
| ----------------------------- | ------ |
| `MovedPermanently(location)`  | 301    |
| `Found(location)`             | 302    |
| `NotModified()`               | 304    |
| `TemporaryRedirect(location)` | 307    |
| `PermanentRedirect(location)` | 308    |

The redirect helpers take the target as their only argument and set `Location`.

**4xx**

| Helper                 | Status |
| ---------------------- | ------ |
| `BadRequest`           | 400    |
| `Unauthorized`         | 401    |
| `PaymentRequired`      | 402    |
| `Forbidden`            | 403    |
| `NotFound`             | 404    |
| `MethodNotAllowed`     | 405    |
| `RequestTimeout`       | 408    |
| `Conflict`             | 409    |
| `Gone`                 | 410    |
| `ContentTooLarge`      | 413    |
| `UnsupportedMediaType` | 415    |
| `UnprocessableEntity`  | 422    |
| `UpgradeRequired`      | 426    |
| `TooManyRequests`      | 429    |

**5xx**

| Helper               | Status |
| -------------------- | ------ |
| `InternalError`      | 500    |
| `NotImplemented`     | 501    |
| `BadGateway`         | 502    |
| `ServiceUnavailable` | 503    |
| `GatewayTimeout`     | 504    |

## What the router returns on its own

Some responses come from the router itself rather than from any handler:

| Status | When                                                         |
| ------ | ------------------------------------------------------------ |
| `400`  | A registered request schema rejected the body                |
| `404`  | No route matched the path                                    |
| `405`  | A route matched the path but not the method                  |
| `501`  | A handler returned a non-`Response` without calling `next()` |
| `500`  | A handler threw                                              |

A `500` from a thrown handler discards the error — nothing is logged by the router itself. Catch and
log inside a middleware if you need the detail:

```ts
router.use(async (ctx, next) => {
	try {
		return await next();
	} catch (error) {
		console.error(ctx.url.pathname, error);
		return InternalError();
	}
});
```
