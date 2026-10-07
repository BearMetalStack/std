import { values } from "./evaluate.ts";
import { parsePipeline } from "./parser.ts";
import type { FormatOptions, Pipeline, Query } from "./types.ts";

const warned = new Set<string>();

function warnOnce(message: string) {
	if (warned.has(message)) return;
	warned.add(message);
	console.warn(message);
}

/**
 * Runs a pipeline against `root` and returns it as text: the query's
 * values, mapped through each template stage, written as strings and joined.
 *
 * `null` and `undefined` are left out. Objects and arrays are left out with a
 * warning, since landing on one usually means the query stopped a key short.
 */
export function format(
	root: unknown,
	pipeline: string | Pipeline,
	options: FormatOptions = {},
): string {
	const parsed = typeof pipeline === "string" ? parsePipeline(pipeline) : pipeline;
	const warn = options.onWarn ?? warnOnce;
	let items = values(root, parsed.query, options);
	let separator = options.block ? "\n" : ", ";

	for (const stage of parsed.stages) {
		if (stage.kind === "separator") {
			separator = stage.value;
			continue;
		}
		items = items.map((item) =>
			stage.parts.map((part) =>
				typeof part === "string"
					? part
					: texts(values(root, part, { ...options, self: item }), part, warn).join(", ")
			).join("")
		);
	}

	return texts(items, parsed.query, warn).join(separator);
}

/** True when a pipeline has a template stage, i.e. its output is markup rather than a value. */
export function hasTemplate(pipeline: string | Pipeline): boolean {
	const parsed = typeof pipeline === "string" ? parsePipeline(pipeline) : pipeline;
	return parsed.stages.some((stage) => stage.kind === "template");
}

function texts(items: unknown[], query: Query, warn: (message: string) => void): string[] {
	const out: string[] = [];
	for (const item of items) {
		if (item === null || item === undefined) continue;
		if (typeof item === "object" || typeof item === "function") {
			warn(
				`bmql: "${query.source}" landed on ${
					Array.isArray(item) ? "an array" : "an object"
				}, which has no text; it was left out.`,
			);
			continue;
		}
		out.push(String(item));
	}
	return out;
}
