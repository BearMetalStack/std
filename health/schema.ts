/**
 * @module
 * Forge schemas for the dashboard manifest and for the payload each module type renders.
 *
 * Aggregators validate what they fetch from an app with these same schemas, so an app and its
 * dashboard always agree on the contract.
 */

import {
	f,
	type JSONSchema,
	type ObjectSchema,
	type ParseResult,
	Schema,
	type SchemaShape,
	type ValidationIssue,
} from "@bearmetal/router";
import type {
	DashManifest,
	DashModule,
	DashModuleType,
	LogLine,
	PayloadMap,
	TimeseriesEvent,
} from "./types.ts";

// ─── Tagged union ─────────────────────────────────────────────────────────────

/**
 * A union picked by the value of one key, so a mismatch reports the member's own issues instead
 * of forge's generic "did not match any union member".
 */
export class TaggedUnionSchema<T> extends Schema<T> {
	constructor(
		readonly tag: string,
		readonly members: Readonly<Record<string, Schema<unknown>>>,
		protected readonly description?: string,
	) {
		super();
	}

	_parse(value: unknown, path: (string | number)[]): ParseResult<T> {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return { success: false, issues: [{ path, message: "Expected object" }] };
		}
		const key = (value as Record<string, unknown>)[this.tag];
		const member = typeof key === "string" && Object.hasOwn(this.members, key)
			? this.members[key]
			: undefined;
		if (!member) {
			return {
				success: false,
				issues: [{
					path: [...path, this.tag],
					message: `Expected one of: ${Object.keys(this.members).map((k) => `"${k}"`).join(", ")}`,
				}],
			};
		}
		return member._parse(value, path) as ParseResult<T>;
	}

	toJSONSchema(): JSONSchema {
		return {
			oneOf: Object.values(this.members).map((m) => m.toJSONSchema()),
			...(this.description ? { description: this.description } : {}),
		};
	}
}

// ─── Modules ──────────────────────────────────────────────────────────────────

const base = {
	id: f.string().nonEmpty(),
	title: f.string(),
	source: f.string().regex(/^\//, "Expected a path starting with /"),
	sourceType: f.enum("sse", "static"),
	pollInterval: f.number().positive().optional(),
	size: f.enum("s", "m", "l").optional(),
	format: f.object({
		unit: f.string().optional(),
		decimals: f.number().int().min(0).optional(),
		kind: f.enum("number", "bytes", "ms", "percent").optional(),
	}).optional(),
	thresholds: f.object({
		warn: f.number().optional(),
		crit: f.number().optional(),
		direction: f.enum("above", "below").optional(),
	}).optional(),
};

function moduleOf<T extends DashModuleType, E extends SchemaShape>(
	type: T,
	extra: E,
): ObjectSchema<typeof base & { _type: Schema<T> } & E> {
	return f.object({ ...base, _type: f.literal(type), ...extra });
}

/** Per-type module schemas, keyed by `_type`. */
export const moduleSchemas: Readonly<Record<DashModuleType, Schema<unknown>>> = {
	stat: moduleOf("stat", { sparkline: f.boolean().optional() }),
	gauge: moduleOf("gauge", { min: f.number().optional(), max: f.number().optional() }),
	timeseries: moduleOf("timeseries", { window: f.number().positive().optional() }),
	histogram: moduleOf("histogram", {}),
	log: moduleOf("log", { maxLines: f.number().int().positive().optional() }),
	status: moduleOf("status", {}),
	table: moduleOf("table", {}),
};

/** Any dashboard module, picked by `_type`. */
export const moduleSchema: Schema<DashModule> = new TaggedUnionSchema<DashModule>(
	"_type",
	moduleSchemas,
);

// ─── Manifest ─────────────────────────────────────────────────────────────────

const manifestShape = f.object({
	schemaVersion: f.literal(1),
	identifier: f.string().regex(
		/^[a-z0-9][a-z0-9-]*$/,
		"Expected a slug: lowercase letters, digits, and dashes",
	),
	name: f.string().nonEmpty(),
	description: f.string(),
	weight: f.number().optional(),
	version: f.string().optional(),
	links: f.array(f.object({ label: f.string(), href: f.string() })).optional(),
	critter: f.object({
		hue: f.number().min(0).max(360).optional(),
		species: f.enum("blob", "bun", "bean", "puff").optional(),
		accessory: f.string().optional(),
	}).optional(),
	keyModules: f.array(moduleSchema).nonempty(),
	modules: f.array(moduleSchema),
});

class ManifestSchema extends Schema<DashManifest> {
	protected readonly description = "A @bearmetal/health dashboard manifest";

	_parse(value: unknown, path: (string | number)[]): ParseResult<DashManifest> {
		const result = manifestShape._parse(value, path);
		if (!result.success) return result;

		const issues: ValidationIssue[] = [];
		const seen = new Set<string>();
		for (const list of ["keyModules", "modules"] as const) {
			result.data[list].forEach((m, i) => {
				if (seen.has(m.id)) {
					issues.push({ path: [...path, list, i, "id"], message: `Duplicate module id "${m.id}"` });
				}
				seen.add(m.id);
				if (m.sourceType === "sse" && m.pollInterval !== undefined) {
					issues.push({
						path: [...path, list, i, "pollInterval"],
						message: "pollInterval only applies to static sources",
					});
				}
			});
		}
		return issues.length
			? { success: false, issues }
			: { success: true, data: result.data as DashManifest };
	}

	toJSONSchema(): JSONSchema {
		return { ...manifestShape.toJSONSchema(), description: this.description };
	}
}

/** Validates a whole {@link DashManifest}, including that module ids are unique. */
export const manifestSchema: Schema<DashManifest> = new ManifestSchema();

// ─── Payloads ─────────────────────────────────────────────────────────────────

const point = f.array(f.number()).min(2).max(2);
const logLine = f.object({
	t: f.number(),
	level: f.enum("debug", "info", "warn", "error"),
	msg: f.string(),
});
const cell = f.union(f.string(), f.number(), f.boolean(), f.literal(null));

/** Schemas for the payload a static source of each module type returns. */
export const payloadSchemas: { readonly [K in DashModuleType]: Schema<PayloadMap[K]> } = {
	stat: f.object({ value: f.number(), at: f.number().optional() }) as Schema<PayloadMap["stat"]>,
	gauge: f.object({
		value: f.number(),
		min: f.number().optional(),
		max: f.number().optional(),
	}) as Schema<PayloadMap["gauge"]>,
	timeseries: f.object({
		series: f.array(f.object({ name: f.string(), points: f.array(point) })),
	}) as unknown as Schema<PayloadMap["timeseries"]>,
	histogram: f.object({
		buckets: f.array(f.object({ le: f.number().nullable(), count: f.number() })),
	}) as Schema<PayloadMap["histogram"]>,
	log: f.object({ lines: f.array(logLine) }) as Schema<PayloadMap["log"]>,
	status: f.object({
		checks: f.array(f.object({ name: f.string(), ok: f.boolean(), detail: f.string().optional() })),
	}) as Schema<PayloadMap["status"]>,
	table: f.object({
		columns: f.array(f.string()),
		rows: f.array(f.array(cell)),
	}) as Schema<PayloadMap["table"]>,
};

/** One event on an SSE `timeseries` source. */
export const timeseriesEventSchema: Schema<TimeseriesEvent> = f.object({
	name: f.string().optional(),
	t: f.number(),
	v: f.number(),
}) as Schema<TimeseriesEvent>;

/** One event on an SSE `log` source. */
export const logLineSchema: Schema<LogLine> = logLine as Schema<LogLine>;

/**
 * The schema for one SSE event of the given module type. `timeseries` and `log` sources append a
 * single point or line per event; every other type sends its whole payload each time.
 */
export function eventSchema(type: DashModuleType): Schema<unknown> {
	if (type === "timeseries") return timeseriesEventSchema;
	if (type === "log") return logLineSchema;
	return payloadSchemas[type];
}
