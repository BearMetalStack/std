# API contracts

Declare an endpoint once — its path, its input schema, its response schemas — and derive both halves
from that single declaration: a typed client that enforces the contract on the way out, and a server
module whose controllers are checked against it on the way in.

```ts
import { defineApi } from "@bearmetal/router/api";
```

## The problem it solves

A route declared the ordinary way knows its request schema and, through
[`.responds()`](../validation#response-schemas), can describe its responses. But `.responds()` is
metadata: nothing reads it at request time, and nothing on the client knows it exists. So the shape
of an endpoint gets written twice — once as a schema on the server, once as a hand-maintained
interface next to a `fetch` call — and the two drift.

A contract closes both gaps:

```
               ┌──────────────────┐
               │   api.ts         │   one declaration
               │   defineApi()    │   path + input + responses
               └────────┬─────────┘
                        │
         ┌──────────────┴──────────────┐
         ▼                             ▼
┌─────────────────┐          ┌──────────────────┐
│ client           │          │ createApiModule  │
│ typed call       │  HTTP    │ typed controllers│
│ validates in/out │ ───────▶ │ validates in/out │
└─────────────────┘          └──────────────────┘
```

The response schemas become load-bearing in both directions: the server validates what it is about
to send, and the client validates what it received.

## A complete example

The contract itself, imported by both sides:

```ts
// api.ts
import { defineApi } from "@bearmetal/router/api";
import { s } from "@bearmetal/router";

const User = s.object({ id: s.string(), name: s.string() });
const ApiError = s.object({ code: s.string() });

export const api = defineApi()
	.route("/users", "users")
	.get(s.query({ page: s.number().coerce().optional() }), s.array(User))
	.post(s.object({ name: s.string() }), { 201: User, 409: ApiError })
	.route("/users/:id", "user")
	.get(undefined, { 200: User, 404: ApiError })
	.build();
```

The server:

```ts
// server.ts
import { createApiModule } from "@bearmetal/router/api/server";
import { Conflict, Created, NotFound, Ok } from "@bearmetal/router/response";
import { api } from "./api.ts";

export default createApiModule(api, {
	users: {
		get: (ctx) => Ok(listUsers(ctx.input.page)),
		post: (ctx) =>
			nameTaken(ctx.input.name)
				? Conflict({ code: "duplicate_name" })
				: Created(addUser(ctx.input)),
	},
	user: {
		get: (ctx) => {
			const user = findUser(ctx.params.id); // ctx.params.id is string
			return user ? Ok(user) : NotFound({ code: "no_such_user" });
		},
	},
});
```

The client:

```ts
// anywhere in the browser
import { api } from "./api.ts";

const result = await api.user({ id }).get();
if (result.status === 200) console.log(result.data.name); // User
else console.warn(result.data.code); // ApiError
```

## Two entry points

The contract module is **isomorphic** — it never touches `Deno`, so it bundles for a browser. The
server half is behind a separate specifier so that mounting a module cannot drag server-only code
into a client bundle.

| Specifier                      | Contents                                               | Where       |
| ------------------------------ | ------------------------------------------------------ | ----------- |
| `@bearmetal/router/api`        | `defineApi`, `createClient`, `ApiContractError`, types | anywhere    |
| `@bearmetal/router/api/server` | `createApiModule`                                      | server only |

Import `@bearmetal/router/api/server` from a file that also runs in the browser and the bundle will
pull in `Router`, `Module`, and the `Deno` globals underneath them.

## When to use one

Reach for a contract when something you do not control the types of consumes the endpoint — a
browser bundle, another service, a test suite — and you would otherwise maintain the request and
response shapes in two places.

Stick with [ordinary routes](../routing) for everything else: endpoints that render HTML, webhooks
whose shape someone else dictates, static file serving, anything where there is no second consumer
to keep in sync. A contract is machinery for keeping two sides honest with each other; with only one
side it is overhead.

Contracts compose with everything else — `createApiModule` returns a plain [`Module`](../modules),
so it mounts, nests, and inherits middleware and services exactly like a hand-written one.

## Pages

| Page                   | Covers                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| [Defining](./defining) | The builder, path parameters, inputs, response declarations       |
| [Server](./server)     | Controllers, `createApiModule`, outgoing validation               |
| [Client](./client)     | Calling, result unions, errors, configuration, in-process testing |
