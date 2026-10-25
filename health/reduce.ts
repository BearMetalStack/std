/**
 * @module
 * Folds snapshots and SSE events into the value a module displays. Pure and DOM-free, so the
 * browser components and an aggregator's server share one definition of "what the module shows".
 */

import type {
	DashModule,
	DashModuleType,
	LogLine,
	PayloadMap,
	Point,
	Series,
	StatPayload,
	TimeseriesEvent,
} from "./types.ts";
import { eventSchema, payloadSchemas } from "./schema.ts";

/** A log line with a sequence number, so lists can key on something stable. */
export interface SeqLogLine extends LogLine {
	seq: number;
}

/** What a `stat` module shows: its payload plus, with `sparkline`, its recent history. */
export interface StatView extends StatPayload {
	history: Point[];
}

/** What a `log` module shows. `next` is the sequence number the next line gets. */
export interface LogView {
	lines: SeqLogLine[];
	next: number;
}

/** What each module type displays. Mostly its payload; `stat` and `log` carry a little more. */
export interface ViewMap extends Omit<PayloadMap, "stat" | "log"> {
	stat: StatView;
	log: LogView;
}

/** The displayed value of a module of type `T`, or `null` before any data has arrived. */
export type ModuleView<T extends DashModuleType = DashModuleType> = ViewMap[T] | null;

/** Whether `incoming` is a whole static payload or one SSE event. */
export type Incoming = "snapshot" | "event";

const SPARKLINE_POINTS = 60;
const DEFAULT_LOG_LINES = 200;
const DEFAULT_SERIES_POINTS = 600;

/** Outcome of {@link reduce}: the new view, or why `incoming` was rejected. */
export type ReduceResult =
	| { ok: true; view: ModuleView }
	| { ok: false; error: string };

function trimSeries(points: Point[], window: number | undefined, now: number): Point[] {
	const since = window ? now - window : -Infinity;
	const kept = points.filter(([t]) => t >= since);
	return kept.length > DEFAULT_SERIES_POINTS ? kept.slice(-DEFAULT_SERIES_POINTS) : kept;
}

/**
 * Folds `incoming` into `prev` for `module`, validating it against the module type's contract.
 *
 * `timeseries` and `log` events append (trimmed to `window` / `maxLines`); a snapshot replaces.
 * A `stat` with `sparkline` keeps its last 60 values. Every other type replaces on both.
 */
export function reduce(
	module: DashModule,
	prev: ModuleView,
	incoming: unknown,
	kind: Incoming,
	now: number = Date.now(),
): ReduceResult {
	const schema = kind === "event" ? eventSchema(module._type) : payloadSchemas[module._type];
	const parsed = schema.safeParse(incoming);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.issues.map((i) => `${i.path.join(".") || "payload"}: ${i.message}`).join("; "),
		};
	}
	const data = parsed.data;

	switch (module._type) {
		case "stat": {
			const p = data as StatPayload;
			const history = module.sparkline
				? [...((prev as StatView | null)?.history ?? []), [p.at ?? now, p.value] as Point]
					.slice(-SPARKLINE_POINTS)
				: [];
			return { ok: true, view: { ...p, history } };
		}
		case "timeseries": {
			if (kind === "snapshot") {
				const series = (data as PayloadMap["timeseries"]).series.map((s) => ({
					name: s.name,
					points: trimSeries(s.points, module.window, now),
				}));
				return { ok: true, view: { series } };
			}
			const e = data as TimeseriesEvent;
			const name = e.name ?? "value";
			const series: Series[] = [...((prev as PayloadMap["timeseries"] | null)?.series ?? [])];
			const i = series.findIndex((s) => s.name === name);
			const existing = i === -1 ? [] : series[i].points;
			const last = existing.at(-1);
			const points = last && last[0] === e.t
				? [...existing.slice(0, -1), [e.t, e.v] as Point]
				: [...existing, [e.t, e.v] as Point];
			const next = { name, points: trimSeries(points, module.window, now) };
			if (i === -1) series.push(next);
			else series[i] = next;
			return { ok: true, view: { series } };
		}
		case "log": {
			const max = module.maxLines ?? DEFAULT_LOG_LINES;
			const before = prev as LogView | null;
			let seq = kind === "snapshot" ? 0 : before?.next ?? 0;
			const incomingLines = kind === "snapshot"
				? (data as PayloadMap["log"]).lines
				: [data as LogLine];
			const added = incomingLines.map((l) => ({ ...l, seq: seq++ }));
			const lines = kind === "snapshot" ? added : [...(before?.lines ?? []), ...added];
			return { ok: true, view: { lines: lines.slice(-max), next: seq } };
		}
		default:
			return { ok: true, view: data as ModuleView };
	}
}

/** The single number a module boils down to, for thresholds and moods. `undefined` if it has none. */
export function headline(module: DashModule, view: ModuleView): number | undefined {
	if (!view) return undefined;
	switch (module._type) {
		case "stat":
		case "gauge":
			return (view as StatPayload).value;
		case "timeseries": {
			const s = (view as PayloadMap["timeseries"]).series;
			const lasts = s.map((x) => x.points.at(-1)?.[1]).filter((v) => v !== undefined);
			return lasts.length ? Math.max(...(lasts as number[])) : undefined;
		}
		case "status": {
			const checks = (view as PayloadMap["status"]).checks;
			return checks.filter((c) => !c.ok).length;
		}
		default:
			return undefined;
	}
}

/** How a value sits against a module's thresholds. */
export type Level = "ok" | "warn" | "crit";

/**
 * Places `value` against `module.thresholds`. A `status` module with no thresholds treats any
 * failing check as critical.
 */
export function levelOf(module: DashModule, value: number | undefined): Level {
	if (value === undefined) return "ok";
	const t = module.thresholds;
	if (!t) return module._type === "status" && value > 0 ? "crit" : "ok";
	const past = (limit: number | undefined) =>
		limit !== undefined && (t.direction === "below" ? value <= limit : value >= limit);
	if (past(t.crit)) return "crit";
	if (past(t.warn)) return "warn";
	return "ok";
}
