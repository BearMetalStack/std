/**
 * @module
 * BearMetal Router - Module system.
 *
 * A Module is a self-contained bundle of routes, middleware, and services.
 * Mount it on a Router (or another Module) with `.use()` to merge its routes
 * and automatically register its services on the parent.
 */
// deno-lint-ignore-file no-explicit-any ban-unused-ignore ban-types

import { joinPath } from "@bearmetal/miscellanea";
import { type Infer, Schema } from "./schema.ts";
import type { RouterHandler, Service, ServiceActions, ServiceToken, StateType } from "./types.ts";
import { isInternal } from "@bearmetal/internal";

// ─── Internal type utilities ──────────────────────────────────────────────────

export type Method = "get" | "post" | "put" | "delete" | "patch" | "options";
export type Merge<A, B> = Omit<A, keyof B> & B;

type PartialMethodStates = Partial<Record<Method, StateType>>;

type SetMethodMerge<
	MD extends PartialMethodStates,
	M extends Method,
	K extends StateType,
> =
	& Omit<MD, M>
	& { [P in M]: Merge<MD[P] extends StateType ? MD[P] : StateType, K> };

type MethodStates<Base extends StateType, MD extends PartialMethodStates> = {
	[M in Method]: Merge<Base, MD[M] extends StateType ? MD[M] : StateType>;
};

type SchemaHandler<TState extends StateType, S extends Schema<unknown>> = RouterHandler<
	TState,
	Infer<S>
>;

// deno-lint-ignore no-explicit-any
export type AnyHandler = RouterHandler<any, any>;

// ─── Internal route storage ───────────────────────────────────────────────────

export type RouteConfig<T extends StateType> = {
	handlers: { [method: string]: AnyHandler[] };
	/** Request body schemas keyed by uppercase HTTP method. */
	schemas: { [method: string]: Schema<unknown> };
	/** Response schemas per method and status - for documentation generation. */
	responseSchemas: { [method: string]: { [status: number]: Schema<unknown> } };
	pattern: URLPattern;
	/**
	 * When true, this route is anchored at the root: `resolveModuleStack` skips
	 * joining it with the mount path, and the flag is carried onto the parent's
	 * copy so it stays root-anchored through every bubble up to the root module.
	 */
	absolute?: boolean;
	_phantom?: T;
};

/**
 * Read-only view of a registered route's documentation metadata.
 * Returned by `module.routeRegistry` - safe to read, cannot mutate the live registry.
 */
export type ReadonlyRouteEntry = {
	readonly pattern: URLPattern;
	/** Registered HTTP methods (uppercase). Does not include the internal middleware key. */
	readonly methods: readonly string[];
	/** Request body schemas, keyed by uppercase method. */
	readonly schemas: Readonly<{ [method: string]: Schema<unknown> }>;
	/** Response schemas per method and status code. */
	readonly responseSchemas: Readonly<{
		[method: string]: Readonly<{ [status: number]: Schema<unknown> }>;
	}>;
};

export const GET = "GET";
export const POST = "POST";
export const PUT = "PUT";
export const PATCH = "PATCH";
export const DELETE = "DELETE";
export const OPTIONS = "OPTIONS";
export const _use = "_use";
export const allMethods = [GET, POST, PUT, PATCH, DELETE, OPTIONS, _use];

export function fixPath(path: string): string {
	return path.startsWith("/") ? path : `/${path}`;
}

// ─── RouteConfigurator ────────────────────────────────────────────────────────

export type RouteConfigurator<
	Base extends StateType = StateType,
	MD extends PartialMethodStates = PartialMethodStates,
> = {
	use<K extends StateType = Base>(
		...handlers: RouterHandler<Merge<Base, K>>[] | Module<any>[]
	): RouteConfigurator<Merge<Base, K>, MD>;

	get<S extends Schema<unknown>>(
		schema: S,
		...handlers: SchemaHandler<MethodStates<Base, MD>["get"], S>[]
	): RouteConfigurator<Base, MD>;
	get<K extends StateType = MethodStates<Base, MD>["get"]>(
		...handlers: RouterHandler<Merge<MethodStates<Base, MD>["get"], K>>[]
	): RouteConfigurator<Base, SetMethodMerge<MD, "get", K>>;

	post<S extends Schema<unknown>>(
		schema: S,
		...handlers: SchemaHandler<MethodStates<Base, MD>["post"], S>[]
	): RouteConfigurator<Base, MD>;
	post<K extends StateType = MethodStates<Base, MD>["post"]>(
		...handlers: RouterHandler<Merge<MethodStates<Base, MD>["post"], K>>[]
	): RouteConfigurator<Base, SetMethodMerge<MD, "post", K>>;

	put<S extends Schema<unknown>>(
		schema: S,
		...handlers: SchemaHandler<MethodStates<Base, MD>["put"], S>[]
	): RouteConfigurator<Base, MD>;
	put<K extends StateType = MethodStates<Base, MD>["put"]>(
		...handlers: RouterHandler<Merge<MethodStates<Base, MD>["put"], K>>[]
	): RouteConfigurator<Base, SetMethodMerge<MD, "put", K>>;

	delete<S extends Schema<unknown>>(
		schema: S,
		...handlers: SchemaHandler<MethodStates<Base, MD>["delete"], S>[]
	): RouteConfigurator<Base, MD>;
	delete<K extends StateType = MethodStates<Base, MD>["delete"]>(
		...handlers: RouterHandler<Merge<MethodStates<Base, MD>["delete"], K>>[]
	): RouteConfigurator<Base, SetMethodMerge<MD, "delete", K>>;

	patch<S extends Schema<unknown>>(
		schema: S,
		...handlers: SchemaHandler<MethodStates<Base, MD>["patch"], S>[]
	): RouteConfigurator<Base, MD>;
	patch<K extends StateType = MethodStates<Base, MD>["patch"]>(
		...handlers: RouterHandler<Merge<MethodStates<Base, MD>["patch"], K>>[]
	): RouteConfigurator<Base, SetMethodMerge<MD, "patch", K>>;

	options<S extends Schema<unknown>>(
		schema: S,
		...handlers: SchemaHandler<MethodStates<Base, MD>["options"], S>[]
	): RouteConfigurator<Base, MD>;
	options<K extends StateType = MethodStates<Base, MD>["options"]>(
		...handlers: RouterHandler<Merge<MethodStates<Base, MD>["options"], K>>[]
	): RouteConfigurator<Base, SetMethodMerge<MD, "options", K>>;

	responds(
		method: Method,
		schemas: { [status: number]: Schema<unknown> },
	): RouteConfigurator<Base, MD>;
};

// ─── Module ───────────────────────────────────────────────────────────────────

/**
 * Structural interface describing the minimum surface a Module exposes to the
 * router machinery. Using this instead of the concrete `Module<any>` class
 * lets the router accept module instances from other package versions - the
 * hard-private `#` fields on `Module` make it nominally typed, so a `Module`
 * built against a different import URL (even the same package, different
 * version) would fail an `instanceof` check and a structural assignability
 * check against `Module<any>`.
 */
export interface AnyModule<TState extends StateType = StateType> {
	readonly rawRoutes: Iterable<[string, RouteConfig<TState>]>;
	readonly rawServices: Iterable<[string, Service]>;
	_startCallbacks?: (() => Promise<void>)[];
	// deno-lint-ignore no-explicit-any
	_setParent?(parent: any): void;
	mark: symbol;
}

/** Duck-type guard - true for any object that looks like a Module. */
export function isAnyModule(x: unknown): x is AnyModule<any> {
	return x !== null && typeof x === "object" && "rawRoutes" in x &&
		"rawServices" in x;
}

/** Extracts the state type contribution from a Module. */
export type ModuleStateOf<M extends AnyModule<any>> = M extends AnyModule<infer T> ? T : never;

/**
 * A self-contained bundle of routes, middleware, and services.
 *
 * Mount on a Router with `.use(module)` to merge routes and inherit services.
 * `TState` is the shape this module adds to `ctx.state` in the parent.
 *
 * @example
 * ```ts
 * function authModule(): Module<{ user: User }> {
 *   return new Module<{ user: User }>()
 *     .use(async (ctx, next) => {
 *       ctx.state.user = await authenticate(ctx.request);
 *       return next();
 *     })
 *     .provides("auth", authService)
 *     .route("/auth/login").post(LoginSchema, loginHandler);
 * }
 *
 * const app = new Router()
 *   .use(authModule())  // Router<{ user: User }>
 * ```
 */
export class Module<TState extends StateType = {}> {
	protected routes: Map<string, RouteConfig<StateType>> = new Map();
	protected _services: Map<string, Service> = new Map();
	protected trailingSlash = false;
	protected bearmetalSubrouteWarnings: string[] = [];
	// deno-lint-ignore no-explicit-any
	#parent: Module<any> | null = null;
	// deno-lint-ignore no-explicit-any
	#adoptedCallbacks: ((parent: Module<any>) => boolean | void)[] = [];
	// deno-lint-ignore no-explicit-any
	_pendingCallbacks: ((parent: Module<any>) => boolean | void)[] = [];
	_startCallbacks: (() => Promise<void>)[] = [];

	/**
	 * The Router (or Module) this module was mounted on, or `null` if not yet mounted.
	 * Set automatically when `.use(module)` is called on a parent.
	 */
	// deno-lint-ignore no-explicit-any
	get parent(): Module<any> | null {
		return this.#parent;
	}

	/**
	 * Register a callback to be invoked when this module is mounted on a parent.
	 * Return `false` to defer - the callback will be retried as the module tree is
	 * assembled, with progressively higher ancestors, and once more when the router
	 * is consumed by `handle`. Any callback still returning `false` at that point
	 * throws at startup, not at request time.
	 */
	// deno-lint-ignore no-explicit-any
	onAdopted(callback: (parent: Module<any>) => boolean | void): this {
		this.#adoptedCallbacks.push(callback);
		return this;
	}

	/**
	 * Look up a service registered on this module (or accumulated from its children).
	 * Same interface as `ctx.getService()`. In `onAdopted` callbacks, call this on
	 * the `parent` argument - returning `false` if it throws lets the callback bubble
	 * up to a higher ancestor where the service may be registered.
	 */
	getService<T extends ServiceActions>(
		name: string | ServiceToken<T>,
	): Service<T> {
		const svc = this._services.get(name as string);
		if (!svc) throw new Error(`Service "${String(name)}" not registered`);
		return svc as Service<T>;
	}

	/** @internal Called by the parent when this module is mounted. */
	// deno-lint-ignore no-explicit-any
	_setParent(parent: Module<any>): void {
		this.#parent = parent;
		const toRun = [...this.#adoptedCallbacks, ...this._pendingCallbacks];
		this._pendingCallbacks = [];
		for (const cb of toRun) {
			if (cb(parent) === false) parent._pendingCallbacks.push(cb);
		}
	}

	/**
	 * Register an async callback to run once at startup, after all modules are mounted.
	 * Called by `router.ready()`, or automatically on the first request if `ready()` was
	 * not awaited. Runs after all `onAdopted` dependencies are resolved.
	 *
	 * Use this for async initialization that must complete before serving - migrations,
	 * cache warming, etc. Close over module-scoped variables set by `onAdopted`.
	 */
	onStart(callback: () => Promise<void>): this {
		this._startCallbacks.push(callback);
		return this;
	}

	/** @internal Run all deferred callbacks one final time. Called by Router.ready(). */
	protected _consumePending(): void {
		const failed: ((parent: Module<any>) => boolean | void)[] = [];
		for (const cb of this._pendingCallbacks) {
			if (cb(this) === false) failed.push(cb);
		}
		this._pendingCallbacks = [];
		if (failed.length > 0) {
			throw new Error(
				`${failed.length} onAdopted callback(s) could not resolve - a required service may not be registered`,
			);
		}
	}

	/**
	 * Register a named service on this module.
	 * When this module is `.use()`d on a parent Router, all its services are inherited.
	 */
	provides<T extends ServiceActions>(
		name: string | ServiceToken<T>,
		service: Service<T>,
	): this {
		this._services.set(name as string, service as Service);
		return this;
	}

	/**
	 * Define a route and configure handlers per HTTP method.
	 *
	 * Pass a schema as the first argument to any method handler to automatically
	 * parse and validate the request body and type `ctx.body`.
	 */
	route<T extends StateType = TState>(path: string): RouteConfigurator<T> {
		return this._buildRoute(fixPath(path), false);
	}

	/**
	 * Define a route that is always anchored at the root, regardless of where this
	 * module is mounted. Unlike {@link route}, the path is not joined with the mount
	 * path when the module bubbles up through parents - `/absolute/path` stays
	 * `/absolute/path` even nested several modules deep.
	 *
	 * Otherwise identical to `route` - configure handlers per HTTP method on the
	 * returned configurator, and pass a schema to parse/validate the request body.
	 */
	absoluteRoute<T extends StateType = TState>(path: string): RouteConfigurator<T> {
		return this._buildRoute(fixPath(path), true);
	}

	private _buildRoute<T extends StateType>(
		path: string,
		absolute: boolean,
	): RouteConfigurator<T> {
		const routeConfig = this.getOrCreateConfig(path);
		if (absolute) routeConfig.absolute = true;

		const addHandlers = (method: string, args: unknown[]) => {
			if (args[0] instanceof Schema) {
				const [schema, ...handlers] = args as [
					Schema<unknown>,
					...AnyHandler[],
				];
				routeConfig.schemas[method] = schema;
				(routeConfig.handlers[method] ??= []).push(...handlers);
			} else {
				(routeConfig.handlers[method] ??= []).push(...(args as AnyHandler[]));
			}
		};

		// deno-lint-ignore no-explicit-any
		const configurator: any = {
			get: (...args: unknown[]) => {
				addHandlers(GET, args);
				return configurator;
			},
			post: (...args: unknown[]) => {
				addHandlers(POST, args);
				return configurator;
			},
			put: (...args: unknown[]) => {
				addHandlers(PUT, args);
				return configurator;
			},
			patch: (...args: unknown[]) => {
				addHandlers(PATCH, args);
				return configurator;
			},
			delete: (...args: unknown[]) => {
				addHandlers(DELETE, args);
				return configurator;
			},
			options: (...args: unknown[]) => {
				addHandlers(OPTIONS, args);
				return configurator;
			},
			responds: (
				method: Method,
				schemas: { [status: number]: Schema<unknown> },
			) => {
				routeConfig.responseSchemas[method.toUpperCase()] = schemas;
				return configurator;
			},
			use: (...args: unknown[]) => {
				for (const arg of args) {
					if (isAnyModule(arg)) {
						this.resolveModuleStack(path, arg);
					} else if ("build" in (arg as object)) {
						this.resolveModuleStack(path, (arg as ModuleBuilder).build());
					} else {
						(routeConfig.handlers[_use] ??= []).push(arg as AnyHandler);
					}
				}
				return configurator;
			},
		};

		return configurator;
	}

	/**
	 * Add middleware that applies to every route in this module.
	 * Runs before route-specific handlers.
	 */
	// deno-lint-ignore no-explicit-any
	use(handler: RouterHandler<TState>): Module<any> {
		(this.getOrCreateConfig("/.*").handlers[_use] ??= []).push(
			handler as AnyHandler,
		);
		return this;
	}

	get rawRoutes(): MapIterator<[string, RouteConfig<StateType>]> {
		return this.routes.entries();
	}

	/**
	 * Read-only view of the route registry.
	 * Safe for introspection (e.g. OpenAPI generation) - does not expose mutable handler arrays.
	 */
	get routeRegistry(): IteratorObject<[string, ReadonlyRouteEntry]> {
		return this.routes.entries().map(([path, config]) => [
			path,
			{
				pattern: config.pattern,
				methods: Object.keys(config.handlers).filter((m) => m !== _use),
				schemas: config.schemas,
				responseSchemas: config.responseSchemas,
			} satisfies ReadonlyRouteEntry,
		]);
	}

	get rawServices(): MapIterator<[string, Service]> {
		return this._services.entries();
	}

	protected getOrCreateConfig<T extends StateType>(
		path: string,
	): RouteConfig<T> {
		let config = this.routes.get(path);
		if (!config) {
			config = {
				handlers: {},
				schemas: {},
				responseSchemas: {},
				pattern: new URLPattern({ pathname: path }),
			};
			this.routes.set(path, config);
		}
		return config as RouteConfig<T>;
	}

	// deno-lint-ignore no-explicit-any
	protected resolveModuleStack(path: string, module: AnyModule<any>): void {
		module._setParent?.(this);
		const isInternalModule = isInternal(module);
		for (const [routePath, thatConfig] of module.rawRoutes) {
			// Absolute routes stay root-anchored: skip the mount-path join and
			// carry the flag forward so they survive every subsequent bubble.
			const p = thatConfig.absolute ? routePath : (joinPath(path, routePath).replace(
				/\/$/,
				this.trailingSlash ? "/" : "",
			) || "/");
			const thisConfig = this.getOrCreateConfig(p);
			if (thatConfig.absolute) thisConfig.absolute = true;
			for (const method of allMethods) {
				if (thatConfig.handlers[method]) {
					if (p.match(/^\/?@bearmetal/)) {
						if (
							!isInternalModule &&
							!thatConfig.handlers[method].every((h) => isInternal((h as any)["__module"]))
						) {
							this.bearmetalSubrouteWarnings.push(`Subroute "${p}" is a BearMetal internal route`);
						} else {
							thisConfig.handlers[method] = (thisConfig.handlers[method] ?? [])
								.concat(thatConfig.handlers[method].map((h) => {
									(h as any)["__module"] = module;
									return h;
								}));
						}
					} else {
						thisConfig.handlers[method] = (thisConfig.handlers[method] ?? [])
							.concat(thatConfig.handlers[method]);
					}
				}
				if (thatConfig.schemas[method]) {
					thisConfig.schemas[method] = thatConfig.schemas[method];
				}
				if (thatConfig.responseSchemas[method]) {
					thisConfig.responseSchemas[method] = thatConfig.responseSchemas[method];
				}
			}
		}
		for (const [name, service] of module.rawServices) {
			this._services.set(name, service);
		}
		if (module._startCallbacks) {
			this._startCallbacks.push(...module._startCallbacks);
		}
	}
}

export type ModuleBuilder<TState extends StateType = {}> = {
	build: () => AnyModule<TState>;
};
