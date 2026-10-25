# @bearmetal/health

Health checks, request metrics, and a dashboard manifest for BearMetal apps. Mount one module and an
app answers `/healthz`, can be discovered by aggregators such as EmDash, describes its own
dashboard, and serves the data behind it.

```ts
import { Router } from "@bearmetal/router";
import { builtin, handlerPath, healthModule } from "@bearmetal/health";

const router = new Router();

router.use(healthModule(() => ({
	schemaVersion: 1,
	identifier: "billing",
	name: "Billing",
	description: "Invoices and payments",
	keyModules: [
		{
			id: "rps",
			_type: "stat",
			title: "Requests/s",
			source: builtin.rps,
			sourceType: "sse",
			sparkline: true,
		},
	],
	modules: [
		{
			id: "latency",
			_type: "histogram",
			title: "Latency",
			source: builtin.latency,
			sourceType: "static",
			pollInterval: 5000,
		},
		{
			id: "queue",
			_type: "gauge",
			title: "Queue",
			source: handlerPath("/queue"),
			sourceType: "static",
			pollInterval: 2000,
			max: 100,
		},
	],
}), {
	track: true,
	checks: { db: () => db.ping() },
	handlers: { "/queue": () => Response.json({ value: queue.length }) },
}));
```

Mount it early, before any catch-all route: its middleware times the requests that follow it, and
its `/healthz` needs a turn before a catch-all answers 404.

## Routes

| Route                                       | Answers                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /healthz`                              | The app's own `GET /healthz` if it has one, else `{status, uptime, checks}` (503 if a check fails) |
| `GET /@bearmetal/health`                    | `ok`, with an `x-bearmetal-health` version header. Aggregators scan for this                       |
| `GET /@bearmetal/health/dashboard`          | The manifest as JSON, or a basic dashboard with `Accept: text/html` (or `?format=html`)            |
| `GET /@bearmetal/health/m/:metric`          | A built-in metric's snapshot; `?stream` streams it                                                 |
| `GET /@bearmetal/health/m?stream&names=a,b` | Several built-in metrics over one event stream, as events named after each metric                  |
| `GET /@bearmetal/health/x/*`                | Your `handlers`                                                                                    |

Every route is registered with `absoluteRoute`, so mounting under a prefix moves none of them.

`/healthz` defers by checking `ctx.route`, not by testing what `next()` returns: the router ends
every chain with a 404/405 response, so `next()` never comes back empty.

## Token

Set `token` (or `BEARMETAL_HEALTH_TOKEN`) and the dashboard, metrics, and handlers require it, as
`Authorization: Bearer <token>` or `?token=<token>`. `/healthz` and the discovery ping stay open.
The HTML dashboard passes the token it was opened with on to its own requests.

## Built-in metrics

Turn them on with `track: true`, or pick from `{ requests, latency, errors, memory, exclude }`.

| Metric              | Module type  | Value                                  |
| ------------------- | ------------ | -------------------------------------- |
| `requests`          | `timeseries` | requests per bucket (default 1 s × 60) |
| `rps`               | `stat`       | requests per second over the window    |
| `latency`           | `histogram`  | response times in ms                   |
| `p50`, `p95`, `p99` | `stat`       | response time quantiles in ms          |
| `errors`            | `timeseries` | 5xx responses per bucket               |
| `errorRate`         | `stat`       | percentage of requests that were 5xx   |
| `memory`            | `timeseries` | `rss` and `heapUsed` in bytes          |
| `uptime`            | `stat`       | seconds since startup                  |

Nothing runs on a timer: memory is sampled as requests arrive and when it is read.

## Modules and payloads

Each module's `source` answers with the payload for its `_type`. A `static` source returns the whole
payload; an `sse` source sends one event at a time. `timeseries` and `log` events append, and
everything else replaces. An `sse` source may also answer a plain `GET` with its static payload,
which consumers use to backfill (the built-ins do).

| `_type`      | Static payload                         | SSE event         |
| ------------ | -------------------------------------- | ----------------- |
| `stat`       | `{value, at?}`                         | same              |
| `gauge`      | `{value, min?, max?}`                  | same              |
| `timeseries` | `{series: [{name, points: [[t, v]]}]}` | `{name?, t, v}`   |
| `histogram`  | `{buckets: [{le, count}]}`             | same              |
| `log`        | `{lines: [{t, level, msg}]}`           | `{t, level, msg}` |
| `status`     | `{checks: [{name, ok, detail?}]}`      | same              |
| `table`      | `{columns, rows}`                      | same              |

`@bearmetal/health/schema` exports the forge schemas for all of this, and `@bearmetal/health/reduce`
folds snapshots and events into what a module displays, so consumers share one definition.

## Components

`@bearmetal/health/components` defines `<bmh-module>` (renders a module from its config and data;
never fetches) and `<bmh-feed>` (fetches for the module inside it). They use light DOM and `--bmh-*`
custom properties, so a host page can restyle them completely.

The standalone dashboard's copy is prebuilt into `client/embedded.ts`, so serving it needs no
bundler at runtime. Run `deno task bm:embed` after changing anything under `components/`.

## Demo

`health/examples/demo` makes up its own traffic:

```sh
cd health/examples/demo && PORT=8100 NAME=demo deno task dev
# http://localhost:8100/@bearmetal/health/dashboard?format=html
```
