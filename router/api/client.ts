/**
 * @module
 * The client half of the API contract layer.
 *
 * Isomorphic: this module and its imports never touch `Deno`, so it bundles for
 * the browser. Every call validates the request payload before sending it and
 * the response body after receiving it, against the same forge schemas the
 * server validates with.
 */
// deno-lint-ignore-file no-explicit-any

import { FormDataSchema, QuerySchema, type Schema, SchemaError } from "../schema.ts";
import { buildPath, readResponseBody, toFormData, toSearchParams } from "./encode.ts";
import type {
	AnyController,
	Api,
	ApiClientConfig,
	MethodDef,
	RouteDef,
	RouteTable,
} from "./types.ts";

/**
 * Thrown when a response violates the declared contract - an undeclared status,
 * or a body that fails its schema - and when a request payload fails validation
 * before it is sent.
 */
export class ApiContractError extends Error {
	override readonly name = "ApiContractError";

	constructor(
		message: string,
		readonly endpoint: string,
		readonly method: string,
		readonly status?: number,
	) {
		super(message);
	}
}

/**
 * Whether to validate by default.
 *
 * Deliberately *not* `isDev()` from `@bearmetal/miscellanea/environment`: that
 * returns `"client"` in a browser and on a server started without
 * `--allow-env`, which would silently disable validation in exactly the two
 * cases where it is most likely to catch a real bug. Reading the variable
 * directly here also keeps this module free of a bare `Deno` identifier so it
 * stays browser-bundlable. `server.ts` uses the canonical helper, and the two
 * agree for every value of `BEARMETAL_ENV`.
 */
export function defaultValidateResponses(): boolean {
	const host = globalThis as { Deno?: { env?: { get(key: string): string | undefined } } };
	try {
		return host.Deno?.env?.get?.("BEARMETAL_ENV") !== "prod";
	} catch {
		return true;
	}
}

// ─── Materialization ──────────────────────────────────────────────────────────

/**
 * Builds the callable api object over a set of route definitions.
 * Used by `defineApi().build()` and by {@link createClient}.
 */
export function materializeApi(routes: readonly RouteDef[], config: ApiClientConfig): any {
	const cfg: ApiClientConfig = { ...config };

	const api: Record<string, unknown> = {
		routes,
		configure(next: ApiClientConfig) {
			Object.assign(cfg, next);
		},
		endpoint(key: string) {
			const route = routes.find((r) => r.name === key || r.path === key);
			if (!route) throw new Error(`No endpoint declared for "${key}"`);
			return makeAccessor(route, cfg);
		},
	};

	for (const route of routes) {
		if (route.name) api[route.name] = makeAccessor(route, cfg);
	}
	return api;
}

/**
 * Creates a second client over the same contract with its own configuration.
 * The underlying route definitions are shared, so controllers registered via
 * `setController` remain visible to `createApiModule`.
 */
export function createClient<T extends RouteTable>(
	api: Api<T>,
	config: ApiClientConfig = {},
): Api<T> {
	return materializeApi(api.routes, config) as Api<T>;
}

function makeAccessor(route: RouteDef, cfg: ApiClientConfig) {
	const accessor = (params?: Record<string, string>) => {
		const bag: Record<string, unknown> = {};
		for (const [method, def] of route.methods) {
			bag[method] = (...args: unknown[]) => callEndpoint(route, def, params ?? {}, args, cfg);
		}
		return bag;
	};

	// Controller slots hang off the accessor itself rather than off the call
	// result: a controller serves every value of the path parameters, so
	// requiring them just to register one would be noise.
	for (const [method, def] of route.methods) {
		(accessor as any)[method] = {
			setController(controller: AnyController) {
				def.controller = controller;
			},
		};
	}

	return accessor;
}

// ─── The call ─────────────────────────────────────────────────────────────────

async function callEndpoint(
	route: RouteDef,
	def: MethodDef,
	params: Record<string, string>,
	args: unknown[],
	cfg: ApiClientConfig,
): Promise<unknown> {
	const label = route.name ?? route.path;
	let path = buildPath(route.path, params);
	let body: BodyInit | undefined;

	const hasInput = def.input !== undefined;
	const rawInput = hasInput ? args[0] : undefined;
	const init = (hasInput ? args[1] : args[0]) as RequestInit | undefined;

	const headers = new Headers(cfg.headers);
	if (init?.headers) {
		for (const [key, value] of new Headers(init.headers)) headers.set(key, value);
	}

	if (def.input) {
		if (def.input instanceof QuerySchema) {
			const search = rawInput instanceof URLSearchParams
				? rawInput
				: toSearchParams(def.input.shape, rawInput as Record<string, unknown>);
			assertValidInput(def.input, search, label, def.method);
			const query = search.toString();
			if (query) path += `?${query}`;
		} else if (def.input instanceof FormDataSchema) {
			const form = rawInput instanceof FormData
				? rawInput
				: toFormData(def.input.shape, rawInput as Record<string, unknown>);
			assertValidInput(def.input, form, label, def.method);
			body = form;
		} else {
			const parsed = assertValidInput(def.input, rawInput, label, def.method);
			body = JSON.stringify(parsed);
			if (!headers.has("content-type")) headers.set("content-type", "application/json");
		}
	}

	const request = new Request(resolveUrl(path, cfg.baseUrl), {
		...init,
		method: def.method.toUpperCase(),
		headers,
		body,
	});

	const send = cfg.fetch ?? ((req: Request) => globalThis.fetch(req));
	const response = await send(request);

	const schema = def.responses[response.status];
	if (!schema) {
		throw new ApiContractError(
			`${def.method.toUpperCase()} ${route.path} responded ${response.status}, which the contract does not declare`,
			label,
			def.method,
			response.status,
		);
	}

	const raw = await readResponseBody(response);
	let data: unknown = raw;

	if (cfg.validateResponses ?? defaultValidateResponses()) {
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			throw new ApiContractError(
				`${def.method.toUpperCase()} ${route.path} returned a ${response.status} body that does not match its schema: ${
					new SchemaError(parsed.issues).message
				}`,
				label,
				def.method,
				response.status,
			);
		}
		data = parsed.data;
	}

	return { status: response.status, ok: response.ok, data, response };
}

function assertValidInput(
	schema: Schema<unknown>,
	value: unknown,
	endpoint: string,
	method: string,
): unknown {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		throw new ApiContractError(
			`Invalid request input for ${method.toUpperCase()} ${endpoint}: ${
				new SchemaError(parsed.issues).message
			}`,
			endpoint,
			method,
		);
	}
	return parsed.data;
}

function resolveUrl(path: string, baseUrl?: string | URL): URL {
	const combined = baseUrl === undefined ? path : String(baseUrl).replace(/\/$/, "") + path;
	if (/^[a-z][a-z0-9+.-]*:/i.test(combined)) return new URL(combined);

	const location = (globalThis as { location?: { href: string } }).location;
	if (location) return new URL(combined, location.href);

	throw new Error(
		`Cannot resolve "${combined}" - set an absolute \`baseUrl\` via api.configure({ baseUrl }) or createClient(api, { baseUrl }) when running outside a browser`,
	);
}
