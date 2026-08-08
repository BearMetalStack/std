# Forager

A development route explorer. Mounts one endpoint that renders a table of every route registered on
its parent, with the methods each declares and its request schema as JSON Schema.

```ts
import { ForagerModule } from "@bearmetal/router/modules/forager";

const router = new Router()
	.use(apiModule())
	.use(new ForagerModule());
```

Visit `/@bearmetal/forager`. Override the path if you need to:

```ts
router.use(new ForagerModule({ path: "/routes" }));
```

## What it shows

Three columns, built from the parent's [`routeRegistry`](./routing#introspection): the path pattern,
the registered methods, and the JSON Schema of the request body.

Two limits worth knowing before you read too much into the output. It shows the schema of the
**first** method only, so a path with both a `GET` query schema and a `POST` body schema displays
just one of them. And it ignores response schemas entirely, so anything declared with
[`.responds()`](./validation#response-schemas) or through an [API contract](./api/) does not appear.

Routes with no methods — a path carrying only middleware — are filtered out.

## Mount it last

Forager reads its parent's registry at request time, but it can only see routes that were merged
into that parent. Mounting it before the modules you want listed still works, since the merge
happens on the parent either way — but mounting it on the _right_ parent matters. Mounted on a
sub-module, it only reports that sub-module's routes.

If it is not mounted at all, the endpoint responds `500` with
`ForagerModule is not mounted on a router.`

## It is a trusted module

`ForagerModule` extends [`TrustedModule`](./trusted-modules) and claims the name
`@bearmetal/forager`, so mounting it prints a one-line yellow announcement of the reserved route it
takes. That is expected, not a warning.

## Not for production

There is no authentication on the endpoint. It enumerates your entire routing table, including paths
you may not have wanted to advertise. Gate it behind an environment check:

```ts
if (environment() !== "prod") router.use(new ForagerModule());
```

The module's own doc comment describes it as a starting point for a full OpenAPI implementation
rather than a finished one — for generating a real specification, read `routeRegistry` directly,
where both request and response schemas are available per method.
