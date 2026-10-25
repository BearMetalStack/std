/**
 * @module
 * Where everything `@bearmetal/health` serves lives. Dependency-free, so browser code can import
 * it without pulling in the router.
 */

import type { BuiltinMetric } from "./types.ts";

/** Root of everything `@bearmetal/health` serves, apart from `/healthz`. */
export const HEALTH_BASE = "/@bearmetal/health";

/** Where the manifest (JSON) and the standalone dashboard (HTML) are served. */
export const DASHBOARD_PATH = `${HEALTH_BASE}/dashboard`;

/** Where the standalone dashboard's client script is served. */
export const CLIENT_SCRIPT_PATH = `${HEALTH_BASE}/assets/client.js`;

/** Where the built-in metrics live. `GET` it with `?stream&names=a,b` to stream several at once. */
export const METRICS_PATH = `${HEALTH_BASE}/m`;

/** Every built-in metric, in display order. */
export const METRICS = [
	"requests",
	"rps",
	"latency",
	"p50",
	"p95",
	"p99",
	"errors",
	"errorRate",
	"memory",
	"uptime",
] as const satisfies readonly BuiltinMetric[];

/**
 * Paths of the built-in metrics, for use as a module `source`:
 *
 * | Metric | Module type | Value |
 * |---|---|---|
 * | `requests` | `timeseries` | requests per bucket |
 * | `rps` | `stat` | requests per second over the window |
 * | `latency` | `histogram` | response times in ms |
 * | `p50` `p95` `p99` | `stat` | response time quantiles in ms |
 * | `errors` | `timeseries` | 5xx responses per bucket |
 * | `errorRate` | `stat` | percentage of requests that were 5xx |
 * | `memory` | `timeseries` | `rss` and `heapUsed` in bytes |
 * | `uptime` | `stat` | seconds since startup |
 *
 * Each answers a plain GET with its static payload, and streams with `?stream`.
 */
export const builtin: Readonly<Record<BuiltinMetric, string>> = Object.fromEntries(
	METRICS.map((m) => [m, `${METRICS_PATH}/${m}`]),
) as Record<BuiltinMetric, string>;

/** The path a user handler registered under `key` is served at. */
export function handlerPath(key: `/${string}`): string {
	return `${HEALTH_BASE}/x${key}`;
}

/** True when `name` is one of the built-in metrics. */
export function isBuiltin(name: string | undefined): name is BuiltinMetric {
	return (METRICS as readonly string[]).includes(name ?? "");
}
