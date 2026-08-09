# RouterContext

Every handler and middleware receives a `RouterContext<TState, TBody>` as its first argument.

```ts
import type { RouterContext } from "@bearmetal/router/types";
```

| Property            | Type                                  | Description                                          |
| ------------------- | ------------------------------------- | ---------------------------------------------------- |
| `url`               | `URL`                                 | Parsed request URL                                   |
| `params`            | `Record<string, string \| undefined>` | Named URL pattern segments, percent-decoded          |
| `state`             | `TState`                              | Per-request state shared across the handler chain    |
| `request`           | `Request`                             | The raw Fetch API `Request`                          |
| `body`              | `TBody`                               | Parsed body — `string` unless a schema is registered |
| `query`             | `Record<string, string>`              | Raw query parameters, always present                 |
| `cookies`           | `Map<string, string>`                 | Parsed `Cookie` header                               |
| `connection`        | `Deno.ServeHandlerInfo`               | Connection info, as handed to `Deno.serve`           |
| `getService(token)` | `Service<T>`                          | Look up a registered service                         |

## params

Populated from the matched `URLPattern` groups, merged across every route that matched. Values are
percent-decoded; a malformed escape sequence passes through undecoded rather than throwing.

The type is always `string | undefined` — the router cannot know from the type of a `string` path
which segments it declares. [API contracts](./api/defining#path-parameters) infer it from the path
literal if you want `ctx.params.id` to be `string`.

## state

An empty object at the start of each request, populated by middleware as the chain runs. See
[typing ctx.state](./middleware#typing-state) for how the type is threaded.

## body

`string` by default — the router calls `req.text()` when no schema is registered for the route and
method. Register a schema and `body` becomes that schema's inferred output type, already validated.

Which part of the request it comes from depends on the schema's class, not the HTTP method:

| Schema              | Source                 |
| ------------------- | ---------------------- |
| `s.query({...})`    | `url.searchParams`     |
| `s.formData({...})` | `await req.formData()` |
| anything else       | `await req.json()`     |

See [Request validation](./validation).

::: tip A query schema lands on `body`, not `query`

`s.query()` parses the search parameters, but the result is assigned to `ctx.body` like any other
schema output. `ctx.query` remains the raw, unvalidated `Record<string, string>`.

:::

## query

`Object.fromEntries(url.searchParams)` — always available, regardless of whether a schema is
registered. Because it goes through `fromEntries`, a repeated parameter collapses to its last value;
read `ctx.url.searchParams` directly, or use an `s.query()` schema with an array field, when repeats
matter.

## cookies

Parsed from the `Cookie` header into a `Map`. Parsing is a simple split on `;` and `=`, so a cookie
value containing `=` is truncated at the first one. It is a convenience for reading session
identifiers, not a complete cookie implementation, and there is no matching helper for setting
cookies — set `Set-Cookie` on the response headers yourself.

## getService()

Looks up a service registered anywhere on the module tree at or above the route. Throws if the name
is not registered. See [Services](./services).

```ts
const db = ctx.getService(dbToken);
await db.invoke("query", "SELECT 1");
```
