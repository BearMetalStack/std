# Calling a contract

The contract object is the client. Path parameters go to the endpoint, input goes to the method, and
the result is a union discriminated on `status`.

```ts
import { api } from "./api.ts";

const result = await api.user({ id }).get();

if (result.status === 200) {
	result.data.name; // User
} else {
	result.data.code; // ApiError
}
```

No separate client class, no code generation step — `api` is the same object the server imports, so
the two can never describe different endpoints.

## Making a call

```ts
api.<name>(pathParams)[method](input, init?)
api.endpoint(path)(pathParams)[method](input, init?)
```

The path-parameter argument is required only when the route declares parameters, and optional when
every one is optional. The input argument exists only when the endpoint declares an input schema:

```ts
api.health().get(); // no params, no input
api.users().get({ page: 2 }); // no params, query input
api.user({ id }).get(); // params, no input
api.users().post({ name: "Ada" }); // no params, JSON body
api.endpoint("/health")().get(); // unnamed route, by path
```

A `RequestInit` can be passed as the last argument, for headers, an `AbortSignal`, credentials, and
so on. Per-call headers are merged over the configured ones:

```ts
await api.user({ id }).get({ signal: controller.signal });
await api.users().post({ name }, { headers: { "x-request-id": id } });
```

Query endpoints also accept a pre-built `URLSearchParams` in place of the object, for the cases
where you already have one:

```ts
await api.users().get(new URLSearchParams({ page: "2" }));
```

## The result

```ts
{
	status: 200; // the declared literal, not `number`
	ok: true; // narrowed per status
	data: User; // parsed and validated
	response: Response; // the raw response, body already consumed
}
```

The union covers exactly the declared statuses, which is what makes the `else` branch narrow instead
of falling back to `unknown`. `ok` is a literal `true` or `false` derived from the status, so both
`status` and `ok` work as discriminants.

`response` is there for headers and anything else the typed fields do not cover. Its body has
already been read.

## Validation

Both directions are checked.

**Outgoing**, before the request is sent: the input is encoded first — to `URLSearchParams`,
`FormData`, or JSON, matching the schema class — and then the _encoded_ form is validated. That way
what gets validated is exactly what the server will parse, coercion included. A failure throws
without sending anything.

**Incoming**, after the response arrives: the body is parsed according to its content type and
validated against the schema declared for that status.

Response validation is on by default and skipped when `BEARMETAL_ENV=prod`, matching the server.
Override it per client:

```ts
createClient(api, { validateResponses: false });
```

Input validation always runs — it is cheap, and it is the difference between a clear error at the
call site and a `400` from the server with no context.

## ApiContractError

Thrown when the contract is violated rather than when the request merely fails:

| Cause                                         | Thrown          |
| --------------------------------------------- | --------------- |
| Input fails its schema                        | before sending  |
| Response status was never declared            | after receiving |
| Response body fails the schema for its status | after receiving |

```ts
class ApiContractError extends Error {
	readonly endpoint: string;
	readonly method: string;
	readonly status?: number;
}
```

A declared error status is **not** an error — a `404` you declared comes back as a normal result to
be narrowed. Only undeclared ones throw, which is what keeps the result union honest.

```ts
try {
	const result = await api.user({ id }).get();
	// 200 and 404 both land here
} catch (error) {
	if (error instanceof ApiContractError) {
		// 401 from an auth middleware, a malformed body, a schema drift
	}
	// network failures propagate from fetch as usual
}
```

This is the trade-off worth understanding: declaring every status the endpoint deliberately produces
gets you exhaustive narrowing, and anything undeclared surfaces loudly instead of silently widening
the type. If an auth layer in front of your API returns `401`, declare it on the endpoints it
guards.

## Configuration

Calls default to the current origin, which is the common case for a browser hitting its own backend.
Outside a browser, or against a different origin, configure a client:

```ts
import { createClient } from "@bearmetal/router/api";

const client = createClient(api, {
	baseUrl: "https://example.test/v1",
	headers: { authorization: `Bearer ${token}` },
});
```

| Option              | Default                        | Notes                                              |
| ------------------- | ------------------------------ | -------------------------------------------------- |
| `baseUrl`           | the document's origin          | prefixed to every path; required outside a browser |
| `fetch`             | `globalThis.fetch`             | any `(Request) => Response \| Promise<Response>`   |
| `headers`           | none                           | merged into every request, per-call wins           |
| `validateResponses` | on unless `BEARMETAL_ENV=prod` |                                                    |

`createClient` shares the underlying route definitions, so several clients can point at different
hosts while describing the same contract. `api.configure({...})` mutates the default client in place
instead.

Without a `baseUrl` and outside a browser, a call throws with a message telling you to set one
rather than failing on a relative URL.

## Testing in-process

`fetch` accepts anything with the right shape, and a router's own `handle` has it. Passing one wires
a client straight into a router with no network, no port, and no server:

```ts
const router = new Router().use(createApiModule(api, controllers));

const client = createClient(api, {
	baseUrl: "http://localhost",
	fetch: (req) => router.handle(req, {} as Deno.ServeHandlerInfo),
});

const result = await client.user({ id: "1" }).get();
```

That single call exercises the whole chain — encode, route match, schema parse, controller, outgoing
validation, decode, incoming validation. It is how this package tests itself, and it is the fastest
way to get real coverage of an API without standing anything up.

The same trick works for server-side rendering, where a page needs its own API's data and a loopback
HTTP request would be waste.
