/**
 * Shared types for the route generator.
 *
 * @module
 */

/** The HTTP methods the generator knows how to scaffold. */
export type Method = "get" | "post" | "put" | "patch" | "delete" | "options";

/** Every method, in the order they are emitted into a route chain. */
export const METHODS: readonly Method[] = [
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"options",
];

/** Methods that carry a request body, and so can be given a `--body-schema`. */
export const BODY_METHODS: readonly Method[] = ["post", "put", "patch"];

/**
 * The CRUD-mnemonic single-letter aliases, mapped to their method.
 *
 * `C`reate → POST, `R`ead → GET, `U`pdate → PUT, `D`elete → DELETE, plus `P`atch
 * and `O`ptions for the two methods CRUD has no letter for. These are what make
 * `-CRUD` and `-CR` work once the bundle is expanded.
 */
export const METHOD_LETTERS: Readonly<Record<string, Method>> = {
	C: "post",
	R: "get",
	U: "put",
	D: "delete",
	P: "patch",
	O: "options",
};

/** A reference to a schema exported from a file in the user's project. */
export interface SchemaRef {
	/** Module path, relative to the project root, e.g. `"schemas.ts"`. */
	module: string;
	/** Name of the exported schema, e.g. `"user"`. */
	name: string;
}

/** A response-schema reference, keyed by the status code it documents. */
export interface ResponseSchemaRef extends SchemaRef {
	status: number;
}

/** A fully-resolved instruction to scaffold one route. */
export interface RouteRequest {
	/** Normalised path — leading slash, no trailing slash. e.g. `"/api/users/:id"`. */
	path: string;
	/** Methods to add, de-duplicated and in canonical order. */
	methods: Method[];
	/** Optional request-body schema, attached to the body-bearing methods. */
	bodySchema?: SchemaRef;
	/** Response schemas, emitted as a single `.responds()` on the primary method. */
	responseSchemas: ResponseSchemaRef[];
	/**
	 * Emit the single-method `router.<method>("/path", handler)` form instead of
	 * the chained `router.route("/path").<method>(handler)` form. Only valid with
	 * exactly one method.
	 */
	shorthand: boolean;
	/** Custom basename (no extension) for a newly-created leaf file. */
	filename?: string;
}

/** Everything the generator needs to know about where it is operating. */
export interface GenerateContext {
	/** Absolute path to the project root. */
	projectRoot: string;
	/** Absolute path to the routes directory. */
	routesDir: string;
	/** The routes directory relative to the project root, e.g. `"routes"`. */
	routesDirName: string;
	/** Print the plan without writing anything. */
	dryRun: boolean;
	/** Wire newly-created top-level modules into the app entry file. */
	wire: boolean;
	/** Where human-readable progress is written. */
	log: (message: string) => void;
}
