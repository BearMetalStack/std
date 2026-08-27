/**
 * The `generate route` command: its argument definitions, the CRUD-flag
 * bundling that lets `-CRUD` mean `-C -R -U -D`, and the translation from parsed
 * args into a partial {@link RouteRequest}.
 *
 * @module
 */

import type { ArgDefsShape } from "@bearmetal/cli/types";
import type { Method, ResponseSchemaRef, SchemaRef } from "./types.ts";
import { METHOD_LETTERS, METHODS } from "./types.ts";
import { parseBodySchema, parseResponseSchema } from "./schema.ts";

/** Argument definitions for `bearmetal generate route`. */
export const routeCommand = {
	$description: "Scaffold a route file that follows BearMetal's router conventions",

	path: {
		type: "string",
		prompt: "Route path",
		$description: "URL path for the route, e.g. /api/users/:id",
		required: [{ if: "nonInteractive", message: "pass --path=/your/route" }],
	},

	get: { type: "flag", aliases: ["-R"], $description: "Add a GET (read) handler" },
	post: { type: "flag", aliases: ["-C"], $description: "Add a POST (create) handler" },
	put: { type: "flag", aliases: ["-U"], $description: "Add a PUT (update) handler" },
	patch: { type: "flag", aliases: ["-P"], $description: "Add a PATCH handler" },
	delete: { type: "flag", aliases: ["-D"], $description: "Add a DELETE handler" },
	options: { type: "flag", aliases: ["-O"], $description: "Add an OPTIONS handler" },

	bodySchema: {
		type: "string",
		$description: "Request body schema as <path>:<export>, e.g. schemas.ts:user",
	},
	responseSchema: {
		type: "list",
		aliases: ["--res-schema"],
		$description: "Response schema as [status:]<path>:<export>",
	},

	filename: {
		type: "string",
		aliases: ["-f", "--file"],
		$description: "Base filename for a new leaf route file (default: derived from the path)",
	},
	shorthand: {
		type: "flag",
		aliases: ["-s"],
		$description: "Emit router.<method>(path, handler); only valid with a single method",
	},

	routesDir: {
		type: "string",
		default: "routes",
		$description: "Directory that holds route files, relative to the project root",
	},
	root: {
		type: "string",
		$description: "Project root directory (default: the current directory)",
	},
	wire: {
		type: "confirm",
		default: true,
		$description: "Wire a new top-level route into the app entry file",
	},
	dryRun: {
		type: "flag",
		$description: "Print the planned changes without writing anything",
	},
} satisfies ArgDefsShape;

/** The subset of resolved args the route generator reads. */
export interface RouteArgs {
	path?: string;
	get: boolean;
	post: boolean;
	put: boolean;
	patch: boolean;
	delete: boolean;
	options: boolean;
	bodySchema?: string;
	responseSchema: string[];
	filename?: string;
	shorthand: boolean;
	routesDir?: string;
	root?: string;
	wire: boolean;
	dryRun: boolean;
	nonInteractive: boolean;
}

/** A request built from flags alone, before the wizard fills any gaps. */
export interface PartialRequest {
	path?: string;
	methods: Method[];
	bodySchema?: SchemaRef;
	responseSchemas: ResponseSchemaRef[];
	shorthand: boolean;
	filename?: string;
}

/** Collects the method flags that were set, in canonical order. */
export function collectMethods(args: RouteArgs): Method[] {
	const flags: Record<Method, boolean> = {
		get: args.get,
		post: args.post,
		put: args.put,
		patch: args.patch,
		delete: args.delete,
		options: args.options,
	};
	return METHODS.filter((m) => flags[m]);
}

/** Builds a {@link PartialRequest} from parsed args. Throws on malformed schema specs. */
export function partialRequestFromArgs(args: RouteArgs): PartialRequest {
	return {
		path: args.path,
		methods: collectMethods(args),
		bodySchema: args.bodySchema ? parseBodySchema(args.bodySchema) : undefined,
		responseSchemas: (args.responseSchema ?? []).map(parseResponseSchema),
		shorthand: args.shorthand,
		filename: args.filename,
	};
}

/**
 * Expands bundled CRUD flags — `-CRUD` → `-C -R -U -D` — which the arg parser
 * does not do on its own. Only touched when the invocation is `generate route`,
 * and only for clusters whose every letter is a known method letter, so an
 * unrelated `-xy` elsewhere is left for the parser to reject.
 */
export function expandBundledMethodFlags(args: string[]): string[] {
	if (!(args.includes("generate") && args.includes("route"))) return args;
	const out: string[] = [];
	for (const arg of args) {
		const m = /^-([A-Za-z]{2,})$/.exec(arg);
		if (m && [...m[1]].every((ch) => ch in METHOD_LETTERS)) {
			for (const ch of m[1]) out.push("-" + ch);
		} else {
			out.push(arg);
		}
	}
	return out;
}
