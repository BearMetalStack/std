/**
 * A demo app with fake activity, for trying `@bearmetal/health` and EmDash locally.
 *
 * `PORT=8100 NAME=demo deno task dev`, then open http://localhost:8100/@bearmetal/health/dashboard
 */

import { Router } from "@bearmetal/router";
import { builtin, handlerPath, healthModule, sseResponse } from "@bearmetal/health";
import type { LogLine } from "@bearmetal/health/types";

const port = Number(Deno.env.get("PORT") ?? 8100);
const name = Deno.env.get("NAME") ?? "demo";
const levels: LogLine["level"][] = ["info", "info", "info", "debug", "warn", "error"];
const messages = [
	"GET /orders",
	"POST /checkout",
	"cache miss",
	"retrying payment",
	"queue drained",
];
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

let queue = 20;
setInterval(
	() => (queue = Math.max(
		0,
		Math.min(100, queue + Math.round(Math.random() * 16 - 8 + (35 - queue) * 0.1)),
	)),
	1000,
);

const router = new Router();

router.use(healthModule(() => ({
	schemaVersion: 1,
	identifier: name,
	name: name[0].toUpperCase() + name.slice(1),
	description: "A demo app that makes up its own traffic",
	version: "1.0.0",
	links: [{ label: "Source", href: "https://example.com" }],
	keyModules: [
		{
			id: "rps",
			_type: "stat",
			title: "Requests/s",
			source: builtin.rps,
			sourceType: "sse",
			sparkline: true,
			thresholds: { warn: 40, crit: 80 },
		},
		{
			id: "p95",
			_type: "stat",
			title: "p95 latency",
			source: builtin.p95,
			sourceType: "sse",
			format: { kind: "ms" },
			thresholds: { warn: 150, crit: 400 },
		},
		{
			id: "queue",
			_type: "gauge",
			title: "Queue depth",
			source: handlerPath("/queue"),
			sourceType: "static",
			pollInterval: 2000,
			max: 100,
			thresholds: { warn: 60, crit: 85 },
		},
	],
	modules: [
		{
			id: "requests",
			_type: "timeseries",
			title: "Requests",
			source: builtin.requests,
			sourceType: "sse",
			size: "m",
			window: 60_000,
		},
		{
			id: "latency",
			_type: "histogram",
			title: "Latency",
			source: builtin.latency,
			sourceType: "static",
			pollInterval: 5000,
			format: { kind: "ms" },
		},
		{
			id: "memory",
			_type: "timeseries",
			title: "Memory",
			source: builtin.memory,
			sourceType: "sse",
			format: { kind: "bytes" },
		},
		{
			id: "errors",
			_type: "stat",
			title: "Error rate",
			source: builtin.errorRate,
			sourceType: "sse",
			format: { kind: "percent" },
			thresholds: { warn: 2, crit: 10 },
		},
		{
			id: "deps",
			_type: "status",
			title: "Dependencies",
			source: handlerPath("/deps"),
			sourceType: "static",
			pollInterval: 5000,
		},
		{
			id: "log",
			_type: "log",
			title: "Log",
			source: handlerPath("/log"),
			sourceType: "sse",
			size: "m",
			maxLines: 100,
		},
		{
			id: "orders",
			_type: "table",
			title: "Recent orders",
			source: handlerPath("/orders"),
			sourceType: "static",
			pollInterval: 10_000,
		},
	],
}), {
	track: true,
	checks: { queue: () => queue < 95 },
	handlers: {
		"/queue": () => Response.json({ value: queue, max: 100 }),
		"/deps": () =>
			Response.json({
				checks: [
					{ name: "postgres", ok: true },
					{ name: "redis", ok: Math.random() > 0.1, detail: "3 ms" },
					{ name: "payments", ok: queue < 70, detail: queue < 70 ? undefined : "slow" },
				],
			}),
		"/log": (ctx) =>
			sseResponse((send) => {
				const id = setInterval(
					() => send({ t: Date.now(), level: pick(levels), msg: pick(messages) } satisfies LogLine),
					1500,
				);
				return () => clearInterval(id);
			}, { signal: ctx.request.signal }),
		"/orders": () =>
			Response.json({
				columns: ["Order", "Total", "Status"],
				rows: Array.from(
					{ length: 4 },
					(
						_,
						i,
					) => [
						`#${1000 + i}`,
						`$${(Math.random() * 200).toFixed(2)}`,
						pick(["paid", "pending", "refunded"]),
					],
				),
			}),
	},
}));

router.route("/work").get(async () => {
	await new Promise((r) => setTimeout(r, Math.random() * (queue > 60 ? 600 : 120)));
	return Math.random() < 0.03 ? new Response("boom", { status: 500 }) : new Response("done");
});

Deno.serve(
	{ port, onListen: () => console.log(`${name} on http://localhost:${port}`) },
	router.handle,
);

// make up some traffic against ourselves
setInterval(() => {
	for (let i = 0; i < Math.ceil(Math.random() * 12); i++) {
		fetch(`http://localhost:${port}/work`).then((r) => r.body?.cancel()).catch(() => {});
	}
}, 500);
