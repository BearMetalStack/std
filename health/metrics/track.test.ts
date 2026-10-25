import { assert, assertEquals } from "@std/assert";
import { Tracker } from "./track.ts";
import type { HistogramPayload, StatPayload, TimeseriesPayload } from "../types.ts";

function clock(start = 0) {
	let now = start;
	return { now: () => now, advance: (ms: number) => (now += ms) };
}

Deno.test("nothing is enabled by default except uptime", () => {
	const t = new Tracker(undefined);
	assertEquals(t.tracking, false);
	assertEquals(t.enabled("uptime"), true);
	assertEquals(t.enabled("requests"), false);
	assertEquals(t.enabled("memory"), false);
});

Deno.test("track: true turns everything on", () => {
	const t = new Tracker(true);
	for (const m of ["requests", "rps", "latency", "p95", "errors", "errorRate", "memory"] as const) {
		assert(t.enabled(m), m);
	}
});

Deno.test("rps and error rate are computed over completed buckets", () => {
	const c = clock(0);
	const t = new Tracker({ requests: { window: 5000, bucket: 1000 }, errors: true }, c.now);
	for (let i = 0; i < 8; i++) t.record(10, i < 2 ? 500 : 200);
	c.advance(1000);
	t.record(10, 200); // still filling, not counted

	assertEquals((t.snapshot("rps") as StatPayload).value, 8 / 4);
	assertEquals((t.snapshot("errorRate") as StatPayload).value, 25);
	const errors = t.snapshot("errors") as TimeseriesPayload;
	assertEquals(errors.series[0].points.at(-2), [0, 2]);
});

Deno.test("latency quantiles and histogram cover the window", () => {
	const c = clock(0);
	const t = new Tracker({ latency: { buckets: [10, 100] } }, c.now);
	for (const ms of [1, 5, 50, 80, 400]) t.record(ms, 200);

	assertEquals((t.snapshot("p50") as StatPayload).value, 50);
	assertEquals((t.snapshot("p99") as StatPayload).value, 400);
	assertEquals((t.snapshot("latency") as HistogramPayload).buckets, [
		{ le: 10, count: 2 },
		{ le: 100, count: 2 },
		{ le: null, count: 1 },
	]);

	c.advance(120_000);
	assertEquals((t.snapshot("p50") as StatPayload).value, 0);
});

Deno.test("memory is sampled at most once per interval", () => {
	const c = clock(0);
	const t = new Tracker({ memory: { interval: 1000 } }, c.now);
	t.record(1, 200);
	t.record(1, 200);
	c.advance(1000);
	t.record(1, 200);
	const mem = t.snapshot("memory") as TimeseriesPayload;
	assertEquals(mem.series.map((s) => s.name), ["rss", "heapUsed"]);
	assertEquals(mem.series[0].points.length, 2);
});

Deno.test("series stream the last completed bucket", () => {
	const c = clock(0);
	const t = new Tracker({ requests: { bucket: 1000, window: 10_000 } }, c.now);
	t.record(1, 200);
	t.record(1, 200);
	c.advance(1000);
	const { every, events } = t.stream("requests");
	assertEquals(every, 1000);
	assertEquals(events(), [{ name: "requests", t: 0, v: 2 }]);
});

Deno.test("excluded paths match strings exactly and regexes by test", () => {
	const t = new Tracker({ requests: true, exclude: ["/skip", /^\/internal\//] });
	assert(t.excluded("/skip"));
	assert(t.excluded("/internal/x"));
	assert(!t.excluded("/skip/more"));
});
