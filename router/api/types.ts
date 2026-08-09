/**
 * @module
 * Public types for the BearMetal API contract layer.
 *
 * Everything here is type-only and safe to import from a browser bundle - the
 * `RouterContext` and `TypedResponse` references are erased at transpile time.
 */
// deno-lint-ignore-file no-explicit-any ban-types

import type { QuerySchema, Schema } from "../schema.ts";
import type { RouterContext, StateType } from "../types.ts";
import type { TypedResponse } from "../util/response.ts";

// ─── Primitives ───────────────────────────────────────────────────────────────

/** HTTP methods an endpoint may declare. Mirrors the router's `Method`. */
export type ApiMethod = "get" | "post" | "put" | "patch" | "delete" | "options";

/** Response schemas keyed by HTTP status code. */
export type ResponseMap = { [status: number]: Schema<unknown> };

/**
 * What a method declaration accepts as its response argument. A bare schema is
 * shorthand for `{ 200: schema }`.
 */
export type ResponseSpec = Schema<unknown> | ResponseMap;

/** Normalizes the bare-schema shorthand into a full {@link ResponseMap}. */
export type NormalizeResponses<R extends ResponseSpec> = R extends Schema<unknown> ? { 200: R }
	: R;

/** Flattens an intersection so editors show one object instead of `A & B & C`. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Extracts the output type of a schema, or `undefined` when there is no schema. */
export type InputOf<I> = I extends Schema<infer T> ? T : undefined;

/** True for any 2xx status. */
export type Is2xx<S> = `${S & number}` extends `2${string}` ? true : false;

/** Names that would shadow a member of the api object itself. */
export type ReservedName = "endpoint" | "routes" | "configure" | "controllers";

// ─── Path parameters ──────────────────────────────────────────────────────────

type ParamSegment<S extends string> = S extends `${infer N}?` ? { [K in N]?: string }
	: { [K in S]: string };

/**
 * Infers path parameters from a literal route path.
 *
 * Supports `:name` and `:name?`. Other `URLPattern` syntax (`*`, `{}?`) still
 * routes correctly at runtime but contributes no inferred parameters.
 *
 * @example
 * ```ts
 * type P = PathParams<"/users/:id/posts/:postId">;
 * // { id: string } & { postId: string }
 * ```
 */
export type PathParams<P extends string> = P extends `${string}:${infer Param}/${infer Rest}`
	? ParamSegment<Param> & PathParams<`/${Rest}`>
	: P extends `${string}:${infer Param}` ? ParamSegment<Param>
	: {};

// ─── Route table ──────────────────────────────────────────────────────────────

/** A single declared method on a route. */
export type MethodSpec = {
	input: Schema<unknown> | undefined;
	responses: ResponseMap;
};

/** Every method declared on one route. */
export type MethodTable = { [M in ApiMethod]?: MethodSpec };

/** One route in the contract: its path, optional name, and declared methods. */
export type RouteEntry = {
	path: string;
	name: string | undefined;
	methods: MethodTable;
};

/** The whole contract, keyed by route name (or by path when unnamed). */
export type RouteTable = Record<string, RouteEntry>;

/** The key a route is filed under: its name if it has one, otherwise its path. */
export type RouteKey<E extends RouteEntry> = E["name"] extends string ? E["name"] : E["path"];

/** Every path literal present in a route table. */
export type PathsOf<T extends RouteTable> = T[keyof T]["path"];

/** Looks a route up by its path literal. */
export type EntryByPath<T extends RouteTable, P extends string> = Extract<T[keyof T], { path: P }>;

// ─── Client-side call results ─────────────────────────────────────────────────

/**
 * The result of a client call: a union over every declared status, discriminated
 * on `status`.
 *
 * Statuses that were never declared do not appear here - the client throws an
 * {@link ApiContractErrorType} for those rather than widening the union.
 */
export type ApiResult<R extends ResponseMap> = {
	[S in keyof R]: {
		status: S;
		ok: Is2xx<S>;
		data: R[S] extends Schema<infer T> ? T : never;
		/** The raw response. Its body has already been consumed. */
		response: Response;
	};
}[keyof R];

/** Structural type of the error the client throws on any contract violation. */
export type ApiContractErrorType = Error & {
	readonly endpoint: string;
	readonly method: string;
	readonly status?: number;
};

// ─── Server-side controllers ──────────────────────────────────────────────────

/**
 * The context passed to a controller. Identical to `RouterContext` except that
 * `params` is inferred from the route path and `input` carries the validated
 * request payload.
 */
export type ApiContext<St extends StateType, I, P extends string> =
	& Omit<RouterContext<St, InputOf<I>>, "params">
	& {
		params: Simplify<PathParams<P>>;
		/** The parsed and validated request input. Same value as `body`. */
		input: InputOf<I>;
	};

/** The union of typed responses a controller is allowed to return. */
export type ControllerReturn<R extends ResponseMap> = {
	[S in keyof R]: TypedResponse<R[S] extends Schema<infer T> ? T : never, S & number>;
}[keyof R];

/**
 * A controller for one declared method. Its return type is pinned to the
 * declared response schemas, so a status you did not declare - or a payload of
 * the wrong shape for a status you did - is a compile error.
 */
export type Controller<St extends StateType, P extends string, I, R extends ResponseMap> = (
	ctx: ApiContext<St, I, P>,
) => ControllerReturn<R> | Promise<ControllerReturn<R>>;

/** Any controller, for internal storage. */
export type AnyController = (ctx: any) => Response | Promise<Response>;

/** Controllers for every method declared on one route. */
export type RouteControllers<E extends RouteEntry, St extends StateType> = {
	[M in keyof E["methods"] & ApiMethod]: E["methods"][M] extends MethodSpec ? Controller<
			St,
			E["path"],
			E["methods"][M]["input"],
			E["methods"][M]["responses"]
		>
		: never;
};

/** A complete controller map - every declared endpoint must be implemented. */
export type ControllerMap<T extends RouteTable, St extends StateType> = {
	[K in keyof T]: RouteControllers<T[K], St>;
};

/** A controller map that may leave endpoints to `setController`. */
export type PartialControllerMap<T extends RouteTable, St extends StateType> = {
	[K in keyof T]?: Partial<RouteControllers<T[K], St>>;
};

// ─── Configuration ────────────────────────────────────────────────────────────

/** Client-side configuration. */
export type ApiClientConfig = {
	/**
	 * Prefix for every request. Defaults to the current document's origin in a
	 * browser; required everywhere else.
	 */
	baseUrl?: string | URL;
	/**
	 * Replacement for `globalThis.fetch`. Useful for tests and SSR - a
	 * `Router`'s own `handle` is directly assignable, which lets a client call
	 * a router in-process with no network involved.
	 */
	fetch?: (request: Request) => Response | Promise<Response>;
	/** Headers merged into every request. Per-call headers win. */
	headers?: HeadersInit;
	/**
	 * Validate response bodies against their declared schema.
	 * Defaults to `true` everywhere except when `BEARMETAL_ENV=prod`.
	 */
	validateResponses?: boolean;
};

/** Options for {@link ControllerMap}-backed module construction. */
export type ApiModuleOptions = {
	/**
	 * Validate outgoing response bodies against their declared schema.
	 * Defaults to `true` everywhere except when `BEARMETAL_ENV=prod`.
	 */
	validateResponses?: boolean;
};

// ─── Runtime storage ──────────────────────────────────────────────────────────

/** Runtime form of one declared method. */
export type MethodDef = {
	method: ApiMethod;
	input?: Schema<unknown>;
	responses: ResponseMap;
	controller?: AnyController;
};

/** Runtime form of one declared route. */
export type RouteDef = {
	path: string;
	name?: string;
	methods: Map<ApiMethod, MethodDef>;
};

// ─── The api object ───────────────────────────────────────────────────────────

/**
 * Arguments a client call accepts. An endpoint with no input schema takes only
 * an optional `RequestInit`; a query endpoint additionally accepts a
 * pre-built `URLSearchParams`.
 */
export type CallArgs<I> = I extends QuerySchema<any>
	? [input: InputOf<I> | URLSearchParams, init?: RequestInit]
	: I extends Schema<infer T> ? [input: T, init?: RequestInit]
	: [init?: RequestInit];

/** One method on an endpoint, callable as a client. */
export type ApiEndpointMethod<MS extends MethodSpec> = (
	...args: CallArgs<MS["input"]>
) => Promise<ApiResult<MS["responses"]>>;

/** Every declared method on one endpoint, as client callables. */
export type ApiMethodBag<E extends RouteEntry> = {
	[M in keyof E["methods"] & ApiMethod]: E["methods"][M] extends MethodSpec
		? ApiEndpointMethod<E["methods"][M]>
		: never;
};

/** The server-side implementation slot for one method. */
export type ApiControllerSlot<MS extends MethodSpec, P extends string> = {
	/**
	 * Registers the server-side implementation for this endpoint;
	 * `createApiModule(api)` picks it up.
	 *
	 * Prefer passing a complete controller map to `createApiModule` - that form
	 * is checked at compile time, this one only when the module is built.
	 */
	setController(controller: Controller<StateType, P, MS["input"], MS["responses"]>): void;
};

/** Every declared method on one endpoint, as controller slots. */
export type ApiControllerBag<E extends RouteEntry> = {
	[M in keyof E["methods"] & ApiMethod]: E["methods"][M] extends MethodSpec
		? ApiControllerSlot<E["methods"][M], E["path"]>
		: never;
};

/**
 * The callable half of an endpoint. Takes no argument when the route declares
 * no parameters, an optional one when every parameter is optional, and a
 * required one otherwise.
 */
export type ApiEndpointCall<E extends RouteEntry> = keyof PathParams<E["path"]> extends never
	? () => ApiMethodBag<E>
	: {} extends PathParams<E["path"]> ? (params?: Simplify<PathParams<E["path"]>>) => ApiMethodBag<E>
	: (params: Simplify<PathParams<E["path"]>>) => ApiMethodBag<E>;

/**
 * An endpoint. Call it with path parameters to reach the client methods
 * (`api.user({ id }).get()`); read a method off it directly to reach the
 * server-side slot (`api.user.get.setController(fn)`), which needs no
 * parameters because a controller serves every value of them.
 */
export type ApiEndpoint<E extends RouteEntry> = ApiEndpointCall<E> & ApiControllerBag<E>;

/** Members present on every api object, alongside the named endpoints. */
export type ApiCore<T extends RouteTable> = {
	/** Looks up an endpoint by path literal, or by name. */
	endpoint<P extends PathsOf<T>>(path: P): ApiEndpoint<EntryByPath<T, P>>;
	endpoint<K extends keyof T & string>(name: K): ApiEndpoint<T[K]>;
	/** The declared routes, in declaration order. */
	readonly routes: readonly RouteDef[];
	/** Updates this instance's client configuration in place. */
	configure(config: ApiClientConfig): void;
};

/**
 * A built API contract: the declared routes, callable as a typed client and
 * consumable by `createApiModule` on the server.
 */
export type Api<T extends RouteTable> = ApiCore<T> & { [K in keyof T]: ApiEndpoint<T[K]> };
