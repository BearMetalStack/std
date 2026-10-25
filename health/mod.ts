/**
 * @module
 * Health checks, request metrics, and a dashboard manifest for BearMetal apps.
 *
 * Mount {@link healthModule} on a router. Aggregators such as EmDash discover the app through
 * `/@bearmetal/health`, read its manifest from `/@bearmetal/health/dashboard`, and pull each
 * module's data from the source it names.
 */

export { HealthModule, healthModule, TOKEN_ENV, VERSION } from "./module.ts";
export {
	builtin,
	CLIENT_SCRIPT_PATH,
	DASHBOARD_PATH,
	handlerPath,
	HEALTH_BASE,
	isBuiltin,
	METRICS,
	METRICS_PATH,
} from "./paths.ts";
export { formatValue } from "./format.ts";
export { headline, type Level, levelOf, reduce } from "./reduce.ts";
export {
	DEFAULT_LATENCY_BUCKETS,
	type MetricPayload,
	type MetricStream,
	Tracker,
} from "./metrics/track.ts";
export { BucketRing, type Clock, quantile, type Sample, SampleRing } from "./metrics/ring.ts";
export { sseFrame, type SseOptions, sseResponse, type SseSend, wantsStream } from "./sse.ts";
export { type PageOptions, renderPage } from "./page.ts";
export * from "./schema.ts";
export type * from "./types.ts";
