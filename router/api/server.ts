/**
 * @module
 * The server half of the API contract layer.
 *
 * `createApiModule` turns a contract plus its controllers into an ordinary
 * `Module`, registered through the normal `route().get(schema, handler)` path -
 * so mounting, trusted-namespace handling, and `resolveModuleStack` all behave
 * exactly as they do for a hand-written module.
 *
 * This module reaches server-only code. Import it from `@bearmetal/router/api/server`,
 * never from anything that also runs in a browser.
 */
// deno-lint-ignore-file no-explicit-any

import { environment } from "@bearmetal/miscellanea/environment";
import { Module } from "../module.ts";
import { SchemaError } from "../schema.ts";
import { InternalError } from "../util/response.ts";
import type { StateType } from "../types.ts";
import { readResponseBody } from "./encode.ts";
import type {
	AnyController,
	Api,
	ApiModuleOptions,
	ControllerMap,
	MethodDef,
	PartialControllerMap,
	RouteDef,
	RouteTable,
} from "./types.ts";

/**
 * Builds a router `Module` from a contract and a complete set of controllers.
 * Every declared endpoint must appear in the map - omitting one is a type error.
 */
export function createApiModule<T extends RouteTable, St extends StateType = StateType>(
	api: Api<T>,
	controllers: ControllerMap<T, St>,
	options?: ApiModuleOptions,
): Module<St>;

/**
 * Builds a router `Module` from a contract and a partial set of controllers,
 * with the rest supplied through `setController`. Completeness is checked when
 * the module is built rather than at compile time.
 */
export function createApiModule<T extends RouteTable, St extends StateType = StateType>(
	api: Api<T>,
	controllers: PartialControllerMap<T, St>,
	options: ApiModuleOptions & { partial: true },
): Module<St>;

/**
 * Builds a router `Module` from a contract whose controllers were all registered
 * through `setController`.
 */
export function createApiModule<T extends RouteTable, St extends StateType = StateType>(
	api: Api<T>,
	options?: ApiModuleOptions,
): Module<St>;

export function createApiModule(api: any, second?: any, third?: any): Module<any> {
	const routes = api.routes as RouteDef[];

	const keys = new Set<string>();
	for (const route of routes) {
		keys.add(route.path);
		if (route.name) keys.add(route.name);
	}

	const secondIsControllerMap = second != null &&
		Object.keys(second).some((key) => keys.has(key));
	const controllers = secondIsControllerMap
		? second as Record<string, Record<string, AnyController>>
		: undefined;
	const options = (secondIsControllerMap ? third : second) as ApiModuleOptions | undefined;

	// Not `isDev()`: it reports false in a browser and on a server without the
	// env permission. See `defaultValidateResponses` in ./client.ts.
	const validate = options?.validateResponses ?? (environment() !== "prod");

	const module = new Module<any>();
	const missing: string[] = [];

	for (const route of routes) {
		const key = route.name ?? route.path;
		const configurator = module.route(route.path) as any;

		for (const [method, def] of route.methods) {
			const controller = controllers?.[key]?.[method] ?? def.controller;
			if (!controller) {
				missing.push(`${key}.${method}`);
				continue;
			}

			const handler = makeHandler(route, def, controller, validate);
			if (def.input) configurator[method](def.input, handler);
			else configurator[method](handler);
			configurator.responds(method, def.responses);
		}
	}

	if (missing.length > 0) {
		throw new Error(
			`createApiModule: no controller for ${
				missing.join(", ")
			}. Pass them in the controller map or register them with setController().`,
		);
	}

	return module;
}

function makeHandler(
	route: RouteDef,
	def: MethodDef,
	controller: AnyController,
	validate: boolean,
) {
	const label = `${def.method.toUpperCase()} ${route.path}`;

	return async (ctx: any): Promise<Response> => {
		ctx.input = ctx.body;
		const response = await controller(ctx);

		if (!(response instanceof Response)) {
			console.error(`[api] ${label} controller did not return a Response`);
			return InternalError();
		}
		if (!validate) return response;

		const schema = def.responses[response.status];
		if (!schema) {
			console.warn(
				`[api] ${label} responded ${response.status}, which the contract does not declare - passing through unvalidated`,
			);
			return response;
		}

		const raw = await readResponseBody(response.clone());
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			console.error(
				`[api] ${label} produced a ${response.status} body that violates its own declared schema: ${
					new SchemaError(parsed.issues).message
				}`,
			);
			return InternalError();
		}

		return response;
	};
}
