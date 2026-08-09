/**
 * @module
 * The contract builder.
 *
 * `defineApi()` accumulates route declarations and their types across a single
 * chained expression. `.route()` closes the route being configured and opens the
 * next one; `.build()` closes the last and seals the contract.
 *
 * Isomorphic - the built contract is what both the client and the server import.
 */
// deno-lint-ignore-file ban-types

import { Schema } from "../schema.ts";
import { materializeApi } from "./client.ts";
import type {
	Api,
	ApiMethod,
	MethodDef,
	NormalizeResponses,
	ReservedName,
	ResponseMap,
	ResponseSpec,
	RouteDef,
	RouteEntry,
	RouteKey,
	RouteTable,
} from "./types.ts";

// ─── Type-level accumulation ──────────────────────────────────────────────────

type OpenEntry<P extends string, N extends string | undefined> = {
	path: P;
	name: N;
	methods: {};
};

type Commit<Acc extends RouteTable, Cur extends RouteEntry | null> = Cur extends RouteEntry
	? Acc & { [K in RouteKey<Cur>]: Cur }
	: Acc;

type WithMethod<
	Cur extends RouteEntry | null,
	M extends ApiMethod,
	I extends Schema<unknown> | undefined,
	R extends ResponseSpec,
> = Cur extends RouteEntry ? {
		path: Cur["path"];
		name: Cur["name"];
		methods:
			& Omit<Cur["methods"], M>
			& { [K in M]: { input: I; responses: NormalizeResponses<R> } };
	}
	: never;

/**
 * The chained contract builder.
 *
 * `Acc` is everything committed so far; `Cur` is the route currently being
 * configured. Calling a verb before `.route()` resolves `Cur` to `never`, which
 * surfaces as a type error at the next step.
 */
export interface ApiBuilder<Acc extends RouteTable, Cur extends RouteEntry | null> {
	/** Closes the current route and opens a new one at `path`. */
	route<P extends string>(path: P): ApiBuilder<Commit<Acc, Cur>, OpenEntry<P, undefined>>;
	/**
	 * Closes the current route and opens a new one at `path`, reachable as
	 * `api.<name>`. The name may not shadow a member of the api object itself.
	 */
	route<P extends string, N extends string>(
		path: P,
		name: N extends ReservedName ? never : N,
	): ApiBuilder<Commit<Acc, Cur>, OpenEntry<P, N>>;

	get<I extends Schema<unknown> | undefined, R extends ResponseSpec>(
		input: I,
		responses: R,
	): ApiBuilder<Acc, WithMethod<Cur, "get", I, R>>;

	post<I extends Schema<unknown> | undefined, R extends ResponseSpec>(
		input: I,
		responses: R,
	): ApiBuilder<Acc, WithMethod<Cur, "post", I, R>>;

	put<I extends Schema<unknown> | undefined, R extends ResponseSpec>(
		input: I,
		responses: R,
	): ApiBuilder<Acc, WithMethod<Cur, "put", I, R>>;

	patch<I extends Schema<unknown> | undefined, R extends ResponseSpec>(
		input: I,
		responses: R,
	): ApiBuilder<Acc, WithMethod<Cur, "patch", I, R>>;

	delete<I extends Schema<unknown> | undefined, R extends ResponseSpec>(
		input: I,
		responses: R,
	): ApiBuilder<Acc, WithMethod<Cur, "delete", I, R>>;

	options<I extends Schema<unknown> | undefined, R extends ResponseSpec>(
		input: I,
		responses: R,
	): ApiBuilder<Acc, WithMethod<Cur, "options", I, R>>;

	/** Closes the last route and returns the contract. */
	build(): Api<Commit<Acc, Cur>>;
}

// ─── Runtime ──────────────────────────────────────────────────────────────────

const RESERVED: ReadonlySet<string> = new Set<ReservedName>([
	"endpoint",
	"routes",
	"configure",
	"controllers",
]);

function normalizeResponses(spec: ResponseSpec): ResponseMap {
	if (spec instanceof Schema) return { 200: spec };

	const entries = Object.entries(spec);
	if (entries.length === 0) throw new Error("A method must declare at least one response schema");
	for (const [status, schema] of entries) {
		if (!/^\d+$/.test(status)) {
			throw new Error(`Response key "${status}" is not an HTTP status code`);
		}
		if (!(schema instanceof Schema)) {
			throw new Error(`Response schema for status ${status} is not a forge schema`);
		}
	}
	return spec;
}

class SpecBuilder {
	#routes: RouteDef[] = [];
	#keys = new Set<string>();
	#current: RouteDef | null = null;

	route(path: string, name?: string): this {
		this.#commit();

		const fixed = path.startsWith("/") ? path : `/${path}`;
		this.#claim(fixed);
		if (name !== undefined) {
			if (RESERVED.has(name)) {
				throw new Error(
					`"${name}" is a reserved endpoint name - it would shadow a member of the api object`,
				);
			}
			this.#claim(name);
		}

		this.#current = { path: fixed, name, methods: new Map() };
		return this;
	}

	get(input: Schema<unknown> | undefined, responses: ResponseSpec): this {
		return this.#declare("get", input, responses);
	}
	post(input: Schema<unknown> | undefined, responses: ResponseSpec): this {
		return this.#declare("post", input, responses);
	}
	put(input: Schema<unknown> | undefined, responses: ResponseSpec): this {
		return this.#declare("put", input, responses);
	}
	patch(input: Schema<unknown> | undefined, responses: ResponseSpec): this {
		return this.#declare("patch", input, responses);
	}
	delete(input: Schema<unknown> | undefined, responses: ResponseSpec): this {
		return this.#declare("delete", input, responses);
	}
	options(input: Schema<unknown> | undefined, responses: ResponseSpec): this {
		return this.#declare("options", input, responses);
	}

	build(): unknown {
		this.#commit();
		if (this.#routes.length === 0) throw new Error("A contract must declare at least one route");
		return materializeApi(this.#routes, {});
	}

	#declare(method: ApiMethod, input: Schema<unknown> | undefined, responses: ResponseSpec): this {
		if (!this.#current) {
			throw new Error(`Declare a route with .route() before calling .${method}()`);
		}
		if (this.#current.methods.has(method)) {
			throw new Error(`${method.toUpperCase()} is already declared on "${this.#current.path}"`);
		}
		if (input !== undefined && !(input instanceof Schema)) {
			throw new Error(
				`Input for ${method.toUpperCase()} "${this.#current.path}" is not a forge schema - pass \`undefined\` when the endpoint takes no input`,
			);
		}

		const def: MethodDef = { method, input, responses: normalizeResponses(responses) };
		this.#current.methods.set(method, def);
		return this;
	}

	#claim(key: string): void {
		if (this.#keys.has(key)) throw new Error(`Duplicate endpoint key "${key}"`);
		this.#keys.add(key);
	}

	#commit(): void {
		if (!this.#current) return;
		if (this.#current.methods.size === 0) {
			throw new Error(`Route "${this.#current.path}" declares no methods`);
		}
		this.#routes.push(this.#current);
		this.#current = null;
	}
}

/**
 * Starts a new API contract.
 *
 * @example
 * ```ts
 * const api = defineApi()
 *   .route("/users", "users")
 *     .get(s.query({ page: s.number().coerce().optional() }), s.array(User))
 *     .post(NewUser, { 201: User, 409: ApiError })
 *   .route("/users/:id", "user")
 *     .get(undefined, { 200: User, 404: ApiError })
 *   .build();
 * ```
 */
export function defineApi(): ApiBuilder<{}, null> {
	return new SpecBuilder() as unknown as ApiBuilder<{}, null>;
}
