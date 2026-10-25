/**
 * @module
 * Public types for `@bearmetal/health`: the dashboard manifest, the payload each module type
 * renders, and the options `healthModule()` takes.
 */

import type { RouterHandler } from "@bearmetal/router";

// ─── Modules ──────────────────────────────────────────────────────────────────

/** Which renderer a dashboard module uses. Each one has a fixed payload contract. */
export type DashModuleType =
	| "stat"
	| "gauge"
	| "timeseries"
	| "histogram"
	| "log"
	| "status"
	| "table";

/** `static` sources are fetched (and optionally polled); `sse` sources are an event stream. */
export type SourceType = "sse" | "static";

/** How much room a module asks for on a dashboard. */
export type ModuleSize = "s" | "m" | "l";

/** How a module's numbers are displayed. */
export interface ModuleFormat {
	unit?: string;
	decimals?: number;
	kind?: "number" | "bytes" | "ms" | "percent";
}

/**
 * Levels at which a module's value counts as a warning or as critical. EmDash uses these for an
 * app's mood and for the alert rules it suggests. `direction` defaults to `"above"`.
 */
export interface Thresholds {
	warn?: number;
	crit?: number;
	direction?: "above" | "below";
}

/** Fields every dashboard module shares. */
export interface DashModuleBase {
	/** Stable id, unique within the manifest. Alert rules and data routing key on it. */
	id: string;
	title: string;
	/**
	 * Path on the app that serves this module's data. A path under `/@bearmetal/health/` must be a
	 * built-in metric or one of the module's `handlers`.
	 */
	source: string;
	sourceType: SourceType;
	/** Milliseconds between fetches of a `static` source. Omit to fetch once per view. */
	pollInterval?: number;
	size?: ModuleSize;
	format?: ModuleFormat;
	thresholds?: Thresholds;
}

/** A single number, optionally with a sparkline of its recent history. */
export interface StatModule extends DashModuleBase {
	_type: "stat";
	sparkline?: boolean;
}

/** A single number against a range. */
export interface GaugeModule extends DashModuleBase {
	_type: "gauge";
	min?: number;
	max?: number;
}

/** One or more series over time. */
export interface TimeseriesModule extends DashModuleBase {
	_type: "timeseries";
	/** Milliseconds of history to keep when points are appended over SSE. */
	window?: number;
}

/** Counts per bucket. */
export interface HistogramModule extends DashModuleBase {
	_type: "histogram";
}

/** A scrolling list of log lines. */
export interface LogModule extends DashModuleBase {
	_type: "log";
	maxLines?: number;
}

/** A list of named checks that are either passing or not. */
export interface StatusModule extends DashModuleBase {
	_type: "status";
}

/** Rows and columns. */
export interface TableModule extends DashModuleBase {
	_type: "table";
}

/** Any dashboard module. Narrow on `_type`. */
export type DashModule =
	| StatModule
	| GaugeModule
	| TimeseriesModule
	| HistogramModule
	| LogModule
	| StatusModule
	| TableModule;

// ─── Manifest ─────────────────────────────────────────────────────────────────

/** Hints for how an aggregator such as EmDash should draw the app. All optional. */
export interface CritterLook {
	/** Hue in degrees, 0-360. */
	hue?: number;
	species?: "blob" | "bun" | "bean" | "puff";
	accessory?: string;
}

/** A link shown alongside an app's dashboard. */
export interface DashLink {
	label: string;
	href: string;
}

/** Everything an aggregator needs to build a dashboard for an app. */
export interface DashManifest {
	schemaVersion: 1;
	/** Slug identifying the app. Aggregators expect it to be unique among the apps they watch. */
	identifier: string;
	name: string;
	description: string;
	/** Higher weights sort earlier on a combined dashboard. */
	weight?: number;
	version?: string;
	links?: DashLink[];
	critter?: CritterLook;
	/** Modules worth showing when space is short. The first is always shown. Must not be empty. */
	keyModules: DashModule[];
	/** All other modules, shown on the app's own dashboard. */
	modules: DashModule[];
}

/** Returns the manifest. Called on every manifest request, so it can reflect live state. */
export type ManifestFactory = () => DashManifest | Promise<DashManifest>;

// ─── Payloads ─────────────────────────────────────────────────────────────────

/** A point on a series: `[epoch milliseconds, value]`. */
export type Point = [t: number, v: number];

/** Payload of a `stat` source. */
export interface StatPayload {
	value: number;
	at?: number;
}

/** Payload of a `gauge` source. */
export interface GaugePayload {
	value: number;
	min?: number;
	max?: number;
}

/** A named series of points. */
export interface Series {
	name: string;
	points: Point[];
}

/** Payload of a static `timeseries` source. */
export interface TimeseriesPayload {
	series: Series[];
}

/** One event on an SSE `timeseries` source, appended to the series named `name`. */
export interface TimeseriesEvent {
	name?: string;
	t: number;
	v: number;
}

/** A histogram bucket: `count` values were at most `le`. The last bucket's `le` may be `null` (no limit). */
export interface HistogramBucket {
	le: number | null;
	count: number;
}

/** Payload of a `histogram` source. */
export interface HistogramPayload {
	buckets: HistogramBucket[];
}

/** One log line. */
export interface LogLine {
	t: number;
	level: "debug" | "info" | "warn" | "error";
	msg: string;
}

/** Payload of a static `log` source. An SSE `log` source sends one {@link LogLine} per event. */
export interface LogPayload {
	lines: LogLine[];
}

/** One named check on a `status` source. */
export interface StatusCheck {
	name: string;
	ok: boolean;
	detail?: string;
}

/** Payload of a `status` source. */
export interface StatusPayload {
	checks: StatusCheck[];
}

/** Payload of a `table` source. */
export interface TablePayload {
	columns: string[];
	rows: (string | number | boolean | null)[][];
}

/** Maps each module type to the payload its static source returns. */
export interface PayloadMap {
	stat: StatPayload;
	gauge: GaugePayload;
	timeseries: TimeseriesPayload;
	histogram: HistogramPayload;
	log: LogPayload;
	status: StatusPayload;
	table: TablePayload;
}

// ─── Health check ─────────────────────────────────────────────────────────────

/** A named check that contributes to `/healthz`. Throwing counts as failing. */
export type HealthCheck = () => boolean | Promise<boolean>;

/** Body of the default `/healthz` response. */
export interface HealthzBody {
	status: "ok" | "fail";
	/** Seconds since the module was created. */
	uptime: number;
	checks: Record<string, boolean>;
}

// ─── Options ──────────────────────────────────────────────────────────────────

/** Names of the built-in metric endpoints under `/@bearmetal/health/m/`. */
export type BuiltinMetric =
	| "requests"
	| "rps"
	| "latency"
	| "p50"
	| "p95"
	| "p99"
	| "errors"
	| "errorRate"
	| "memory"
	| "uptime";

/** Configures the request tracking that feeds the built-in metrics. */
export interface TrackOptions {
	/** Request counts per bucket. Defaults to a 60-second window of 1-second buckets. */
	requests?: boolean | { window?: number; bucket?: number };
	/** Response times in milliseconds. `buckets` are the histogram's upper limits. */
	latency?: boolean | { buckets?: number[] };
	/** Counts of 5xx responses and thrown errors. */
	errors?: boolean;
	/** Samples `Deno.memoryUsage()` at most once per `interval` milliseconds. */
	memory?: boolean | { interval?: number };
	/** Paths that are never tracked. Defaults to the `/@bearmetal/` namespace and `/healthz`. */
	exclude?: (string | RegExp)[];
}

/** Options for `healthModule()`. */
export interface HealthOptions {
	/** Extra data endpoints, mounted at `/@bearmetal/health/x/<key>`. Keys start with `/`. */
	handlers?: Record<`/${string}`, RouterHandler>;
	/**
	 * Bearer token required by the dashboard, the metrics, and the handlers. Defaults to the
	 * `BEARMETAL_HEALTH_TOKEN` environment variable. `/healthz` and the discovery ping are always open.
	 */
	token?: string;
	/** Named checks reported by the default `/healthz`. Any failure makes it answer 503. */
	checks?: Record<string, HealthCheck>;
	/** Request tracking for the built-in metrics. `true` turns on everything. */
	track?: boolean | TrackOptions;
}
