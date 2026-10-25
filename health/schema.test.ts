import { assert, assertEquals } from "@std/assert";
import { eventSchema, manifestSchema, moduleSchema, payloadSchemas } from "./schema.ts";
import type { DashManifest } from "./types.ts";

const valid: DashManifest = {
	schemaVersion: 1,
	identifier: "billing-api",
	name: "Billing",
	description: "Invoices",
	weight: 2,
	critter: { hue: 200, species: "bun" },
	keyModules: [
		{
			id: "rps",
			_type: "stat",
			title: "Requests/s",
			source: "/@bearmetal/health/m/rps",
			sourceType: "sse",
			sparkline: true,
			thresholds: { warn: 100, crit: 200 },
		},
	],
	modules: [
		{ id: "log", _type: "log", title: "Log", source: "/logs", sourceType: "sse", maxLines: 50 },
		{
			id: "queue",
			_type: "gauge",
			title: "Queue",
			source: "/q",
			sourceType: "static",
			pollInterval: 5000,
			max: 100,
		},
	],
};

function issuePaths(value: unknown): string[] {
	const r = manifestSchema.safeParse(value);
	return r.success ? [] : r.issues.map((i) => i.path.join("."));
}

Deno.test("a valid manifest parses and keeps type-specific fields", () => {
	const r = manifestSchema.safeParse(valid);
	assert(r.success);
	assertEquals(r.data, valid);
});

Deno.test("keyModules must not be empty", () => {
	assertEquals(issuePaths({ ...valid, keyModules: [] }), ["keyModules"]);
});

Deno.test("an unknown _type names the field and the choices", () => {
	const r = moduleSchema.safeParse({ ...valid.modules[0], _type: "pie" });
	assert(!r.success);
	assertEquals(r.issues[0].path, ["_type"]);
	assert(r.issues[0].message.includes('"timeseries"'));
});

Deno.test("member issues are reported with their own paths", () => {
	assertEquals(
		issuePaths({ ...valid, modules: [{ ...valid.modules[1], source: "q", max: "lots" }] }),
		["modules.0.source", "modules.0.max"],
	);
});

Deno.test("module ids must be unique across both lists", () => {
	assertEquals(issuePaths({ ...valid, modules: [{ ...valid.modules[0], id: "rps" }] }), [
		"modules.0.id",
	]);
});

Deno.test("pollInterval is refused on SSE sources", () => {
	assertEquals(
		issuePaths({ ...valid, modules: [{ ...valid.modules[0], pollInterval: 1000 }] }),
		["modules.0.pollInterval"],
	);
});

Deno.test("identifier must be a slug", () => {
	assertEquals(issuePaths({ ...valid, identifier: "Billing API" }), ["identifier"]);
});

Deno.test("payload schemas check each type's contract", () => {
	assert(
		payloadSchemas.timeseries.safeParse({ series: [{ name: "a", points: [[1, 2]] }] }).success,
	);
	assert(!payloadSchemas.timeseries.safeParse({ series: [{ name: "a", points: [[1]] }] }).success);
	assert(payloadSchemas.histogram.safeParse({ buckets: [{ le: null, count: 1 }] }).success);
	assert(payloadSchemas.table.safeParse({ columns: ["a"], rows: [["x", 1, true, null]] }).success);
	assert(!payloadSchemas.stat.safeParse({ value: "1" }).success);
});

Deno.test("SSE events append for timeseries and log, replace otherwise", () => {
	assert(eventSchema("timeseries").safeParse({ t: 1, v: 2 }).success);
	assert(eventSchema("log").safeParse({ t: 1, level: "info", msg: "hi" }).success);
	assert(eventSchema("stat").safeParse({ value: 3 }).success);
});
