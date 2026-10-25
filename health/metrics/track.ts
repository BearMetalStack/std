import type { RouterHandler } from "@bearmetal/router";
import type {
	BuiltinMetric,
	HistogramPayload,
	StatPayload,
	TimeseriesEvent,
	TimeseriesPayload,
	TrackOptions,
} from "../types.ts";
import { BucketRing, type Clock, quantile, SampleRing } from "./ring.ts";

/** Upper limits, in milliseconds, of the default latency histogram. */
export const DEFAULT_LATENCY_BUCKETS: readonly number[] = [
	5,
	10,
	25,
	50,
	100,
	250,
	500,
	1000,
	2500,
	5000,
];

const DEFAULT_EXCLUDE: (string | RegExp)[] = [/^\/@bearmetal\//, "/healthz"];

/** What a built-in metric endpoint answers with: a snapshot, or a stream of events. */
export type MetricPayload = StatPayload | TimeseriesPayload | HistogramPayload;

/** How a metric streams: every `every` milliseconds, send each value `events()` returns. */
export interface MetricStream {
	every: number;
	events: () => unknown[];
}

interface Resolved {
	requests: { window: number; bucket: number } | null;
	latency: { buckets: readonly number[] } | null;
	errors: boolean;
	memory: { interval: number } | null;
	exclude: (string | RegExp)[];
}

function resolve(opts: boolean | TrackOptions | undefined): Resolved {
	const all = opts === true;
	const o: TrackOptions = typeof opts === "object" ? opts : {};
	const pick = <T extends object>(v: boolean | T | undefined): T | boolean =>
		all ? true : (v ?? false);

	const requests = pick(o.requests);
	const latency = pick(o.latency);
	const memory = pick(o.memory);
	return {
		requests: requests
			? {
				window: (typeof requests === "object" && requests.window) || 60_000,
				bucket: (typeof requests === "object" && requests.bucket) || 1_000,
			}
			: null,
		latency: latency
			? { buckets: (typeof latency === "object" && latency.buckets) || DEFAULT_LATENCY_BUCKETS }
			: null,
		errors: !!pick(o.errors),
		memory: memory ? { interval: (typeof memory === "object" && memory.interval) || 5_000 } : null,
		exclude: o.exclude ?? DEFAULT_EXCLUDE,
	};
}

/**
 * Records requests as they pass through and answers the built-in metric endpoints.
 *
 * Nothing here runs on a timer: memory is sampled as requests arrive and when it is read, so an
 * idle app does no work and tests leave no intervals behind.
 */
export class Tracker {
	readonly #opts: Resolved;
	readonly #clock: Clock;
	readonly #started: number;
	readonly #requests?: BucketRing;
	readonly #errors?: BucketRing;
	readonly #durations?: SampleRing;
	readonly #rss?: SampleRing;
	readonly #heap?: SampleRing;

	constructor(opts: boolean | TrackOptions | undefined, clock: Clock = Date.now) {
		this.#opts = resolve(opts);
		this.#clock = clock;
		this.#started = clock();
		const r = this.#opts.requests ?? { window: 60_000, bucket: 1_000 };
		const count = Math.max(2, Math.ceil(r.window / r.bucket));
		if (this.#opts.requests) this.#requests = new BucketRing(r.bucket, count, clock);
		if (this.#opts.errors) this.#errors = new BucketRing(r.bucket, count, clock);
		if (this.#opts.latency) this.#durations = new SampleRing(4096, clock);
		if (this.#opts.memory) {
			this.#rss = new SampleRing(120, clock);
			this.#heap = new SampleRing(120, clock);
		}
	}

	/** The window, in milliseconds, that rates and quantiles are computed over. */
	get window(): number {
		return this.#opts.requests?.window ?? 60_000;
	}

	get #bucket(): number {
		return this.#opts.requests?.bucket ?? 1_000;
	}

	/** True if any request tracking is on, so the middleware is worth mounting. */
	get tracking(): boolean {
		return !!(this.#requests || this.#errors || this.#durations || this.#rss);
	}

	/** Whether `metric` has data behind it. `uptime` always does. */
	enabled(metric: BuiltinMetric): boolean {
		switch (metric) {
			case "uptime":
				return true;
			case "requests":
			case "rps":
				return !!this.#requests;
			case "latency":
			case "p50":
			case "p95":
			case "p99":
				return !!this.#durations;
			case "errors":
				return !!this.#errors;
			case "errorRate":
				return !!(this.#errors && this.#requests);
			case "memory":
				return !!this.#rss;
		}
	}

	/** True when `path` is excluded from tracking. */
	excluded(path: string): boolean {
		return this.#opts.exclude.some((p) => typeof p === "string" ? p === path : p.test(path));
	}

	/** Records one finished request. */
	record(ms: number, status: number): void {
		this.#requests?.add();
		if (status >= 500) this.#errors?.add();
		this.#durations?.push(ms);
		this.#sampleMemory();
	}

	/** Router middleware that times every request not excluded. */
	readonly middleware: RouterHandler = async (ctx, next) => {
		if (this.excluded(ctx.url.pathname)) return await next();
		const t0 = performance.now();
		try {
			const res = await next();
			this.record(performance.now() - t0, res.status);
			return res;
		} catch (e) {
			this.record(performance.now() - t0, 500);
			throw e;
		}
	};

	#sampleMemory(): void {
		if (!this.#rss || !this.#heap || !this.#opts.memory) return;
		const last = this.#rss.latest();
		if (last && this.#clock() - last.t < this.#opts.memory.interval) return;
		const { rss, heapUsed } = Deno.memoryUsage();
		this.#rss.push(rss);
		this.#heap.push(heapUsed);
	}

	#rps(): number {
		const r = this.#requests!;
		return r.completedTotal() / (((r.count - 1) * r.bucket) / 1000);
	}

	#errorRate(): number {
		const total = this.#requests!.completedTotal();
		return total === 0 ? 0 : (this.#errors!.completedTotal() / total) * 100;
	}

	#quantile(q: number): number {
		const values = this.#durations!.within(this.window).map((s) => s.value);
		const v = quantile(values, q);
		return Number.isNaN(v) ? 0 : v;
	}

	#histogram(): HistogramPayload {
		const limits = this.#opts.latency!.buckets;
		const counts = new Array(limits.length + 1).fill(0);
		for (const { value } of this.#durations!.within(this.window)) {
			const i = limits.findIndex((le) => value <= le);
			counts[i === -1 ? limits.length : i]++;
		}
		return {
			buckets: counts.map((count, i) => ({ le: i < limits.length ? limits[i] : null, count })),
		};
	}

	/** The current value of `metric`. Callers check {@link enabled} first. */
	snapshot(metric: BuiltinMetric): MetricPayload {
		const at = this.#clock();
		switch (metric) {
			case "uptime":
				return { value: Math.floor((at - this.#started) / 1000), at };
			case "requests":
				return { series: [{ name: "requests", points: this.#requests!.points() }] };
			case "errors":
				return { series: [{ name: "errors", points: this.#errors!.points() }] };
			case "rps":
				return { value: this.#rps(), at };
			case "errorRate":
				return { value: this.#errorRate(), at };
			case "p50":
				return { value: this.#quantile(0.5), at };
			case "p95":
				return { value: this.#quantile(0.95), at };
			case "p99":
				return { value: this.#quantile(0.99), at };
			case "latency":
				return this.#histogram();
			case "memory": {
				this.#sampleMemory();
				const points = (ring: SampleRing) =>
					ring.within(Infinity).map((s) => [s.t, s.value] as [number, number]);
				return {
					series: [
						{ name: "rss", points: points(this.#rss!) },
						{ name: "heapUsed", points: points(this.#heap!) },
					],
				};
			}
		}
	}

	/** How `metric` streams over SSE. Series append a point per tick; everything else resends its snapshot. */
	stream(metric: BuiltinMetric): MetricStream {
		switch (metric) {
			case "requests":
			case "errors": {
				const ring = metric === "requests" ? this.#requests! : this.#errors!;
				return {
					every: this.#bucket,
					events: () => {
						const [t, v] = ring.lastComplete();
						return [{ name: metric, t, v } satisfies TimeseriesEvent];
					},
				};
			}
			case "memory":
				return {
					every: this.#opts.memory!.interval,
					events: () => {
						this.#sampleMemory();
						const rss = this.#rss!.latest();
						const heap = this.#heap!.latest();
						return [
							...(rss ? [{ name: "rss", t: rss.t, v: rss.value } satisfies TimeseriesEvent] : []),
							...(heap
								? [{ name: "heapUsed", t: heap.t, v: heap.value } satisfies TimeseriesEvent]
								: []),
						];
					},
				};
			case "latency":
				return { every: 5_000, events: () => [this.#histogram()] };
			default:
				return { every: this.#bucket, events: () => [this.snapshot(metric)] };
		}
	}
}
