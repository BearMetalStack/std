import { BadRequest, InternalError, MethodNotAllowed, NotFound } from "@/util/response.ts";
import { resolveStaticFile } from "@/util/static.ts";
import { styleAlias, styles, stylizer } from "./logstyles.ts";
import { FormDataSchema, QuerySchema, SchemaError } from "./schema.ts";
import {
	_use,
	type AnyHandler,
	type AnyModule,
	DELETE,
	fixPath,
	GET,
	isAnyModule,
	type Merge,
	Module,
	type ModuleStateOf,
	OPTIONS,
	PATCH,
	POST,
	PUT,
} from "./module.ts";
import type {
	RouterContext,
	RouterHandler,
	Service,
	ServiceActions,
	ServiceToken,
	StateType,
} from "./types.ts";
import { joinPath } from "@bearmetal/miscellanea";

export type { RouterContext, RouterHandler, Service, ServiceActions, ServiceToken, StateType };

export { isAnyModule, Module };
export type { AnyModule, ModuleStateOf };

// ─── Router ───────────────────────────────────────────────────────────────────

// deno-lint-ignore ban-types
export class Router<TState extends StateType = {}> extends Module<TState> {
	constructor() {
		super();
	}

	registerService<T extends ServiceActions>(
		name: string | ServiceToken<T>,
		service: Service<T>,
	): void {
		this._services.set(name as string, service as Service);
	}

	// ─── use() ─────────────────────────────────────────────────────────────────

	/**
	 * Mount a Module. Its routes are merged into this router and its services
	 * are registered. The accumulated state type is updated to include the
	 * module's state contribution.
	 */
	// deno-lint-ignore no-explicit-any
	override use<M extends AnyModule<any>>(
		module: M,
	): Router<Merge<TState, ModuleStateOf<M>>>;
	// deno-lint-ignore no-explicit-any
	override use<M extends AnyModule<any>>(
		path: string,
		module: M,
	): Router<Merge<TState, ModuleStateOf<M>>>;
	/** Add global middleware that runs before all route handlers. */
	override use(handler: RouterHandler<StateType>): Router<TState>;
	override use(path: string, handler: RouterHandler<StateType>): Router<TState>;
	// deno-lint-ignore no-explicit-any
	override use(...args: any[]): any {
		const hasPath = typeof args[0] === "string";
		const target = hasPath ? args[1] : args[0];

		if (isAnyModule(target)) {
			const path = hasPath ? fixPath(args[0]) : "/";
			this.resolveModuleStack(path, target);
			return this;
		}

		const configPath = hasPath ? fixPath(args[0]) : "/.*";
		(this.getOrCreateConfig(configPath).handlers[_use] ??= []).push(
			target as AnyHandler,
		);
		return this;
	}

	// ─── Shorthand route registration ──────────────────────────────────────────

	private addRoute<T extends StateType>(
		method: string,
		pathOrHandler: string | RouterHandler<T>,
		handler?: RouterHandler<T>,
	): void {
		const path = typeof pathOrHandler === "string" ? fixPath(pathOrHandler) : "/.*";
		if (typeof pathOrHandler !== "string") handler = pathOrHandler;
		(this.getOrCreateConfig(path).handlers[method] ??= []).push(handler!);
	}

	get<T extends StateType = StateType>(handler: RouterHandler<T>): void;
	get<T extends StateType = StateType>(
		path: string,
		handler: RouterHandler<T>,
	): void;
	get<T extends StateType = StateType>(
		p: string | RouterHandler<T>,
		h?: RouterHandler<T>,
	): void {
		this.addRoute(GET, p, h);
	}

	post<T extends StateType = StateType>(handler: RouterHandler<T>): void;
	post<T extends StateType = StateType>(
		path: string,
		handler: RouterHandler<T>,
	): void;
	post<T extends StateType = StateType>(
		p: string | RouterHandler<T>,
		h?: RouterHandler<T>,
	): void {
		this.addRoute(POST, p, h);
	}

	put<T extends StateType = StateType>(handler: RouterHandler<T>): void;
	put<T extends StateType = StateType>(
		path: string,
		handler: RouterHandler<T>,
	): void;
	put<T extends StateType = StateType>(
		p: string | RouterHandler<T>,
		h?: RouterHandler<T>,
	): void {
		this.addRoute(PUT, p, h);
	}

	patch<T extends StateType = StateType>(handler: RouterHandler<T>): void;
	patch<T extends StateType = StateType>(
		path: string,
		handler: RouterHandler<T>,
	): void;
	patch<T extends StateType = StateType>(
		p: string | RouterHandler<T>,
		h?: RouterHandler<T>,
	): void {
		this.addRoute(PATCH, p, h);
	}

	delete<T extends StateType = StateType>(handler: RouterHandler<T>): void;
	delete<T extends StateType = StateType>(
		path: string,
		handler: RouterHandler<T>,
	): void;
	delete<T extends StateType = StateType>(
		p: string | RouterHandler<T>,
		h?: RouterHandler<T>,
	): void {
		this.addRoute(DELETE, p, h);
	}

	options<T extends StateType = StateType>(handler: RouterHandler<T>): void;
	options<T extends StateType = StateType>(
		path: string,
		handler: RouterHandler<T>,
	): void;
	options<T extends StateType = StateType>(
		p: string | RouterHandler<T>,
		h?: RouterHandler<T>,
	): void {
		this.addRoute(OPTIONS, p, h);
	}

	// ─── Logging ───────────────────────────────────────────────────────────────

	logALot(logging = true): void {
		if (!logging) return;
		this.use(async (ctx, next) => {
			const res = await next();
			const { method } = ctx.request;
			console.log(
				`${stylizer(`[${method}]`, styles.method[method])} ${
					stylizer(ctx.url.pathname, styles.path.default)
				} :: ${
					stylizer(
						Temporal.Now.plainDateTimeISO().toString(),
						styles.param.default,
					)
				} :: ${stylizer(res.status, styleAlias("status", res.status))}`,
			);
			return res;
		});
	}

	logALittle(logging = true): void {
		if (!logging) return;
		this.use(async (ctx, next) => {
			const { method } = ctx.request;
			console.log(`[${method}] ${ctx.url.pathname}`);
			return await next();
		});
	}

	// ─── Request handling ──────────────────────────────────────────────────────

	#readyPromise: Promise<void> | null = null;

	/**
	 * Run all `onAdopted` dependency checks and `onStart` async callbacks.
	 * Await this before `Deno.serve` to catch startup errors immediately.
	 * If not called, `handle` will invoke it automatically - errors then surface
	 * on the first request rather than at startup.
	 */
	ready(): Promise<void> {
		if (!this.#readyPromise) {
			this.#readyPromise = (async () => {
				this._consumePending();
				for (const cb of this._startCallbacks) await cb();
			})();
		}
		return this.#readyPromise;
	}

	/** Returns a bound handler suitable for `Deno.serve`. */
	get handle(): Deno.ServeHandler {
		const ready = this.ready();
		ready.catch(() => {}); // surfaced via await in the handler, not as an unhandled rejection
		const handler = this.handler.bind(this);
		return async (req, info) => {
			await ready;
			return handler(req, info);
		};
	}

	async handler(req: Request, info: Deno.ServeHandlerInfo<Deno.Addr>): Promise<Response> {
		const url = new URL(req.url.replace(/\/$/, this.trailingSlash ? "/" : ""));
		const method = req.method;

		const matchingRoutes = this.findMatchingRoutes(url);
		const schema = matchingRoutes.find((r) => r.config.schemas[method])?.config
			.schemas[method];

		const query = Object.fromEntries(url.searchParams);
		let body: unknown;
		try {
			if (schema instanceof QuerySchema) {
				body = schema.parse(url.searchParams);
			} else if (schema instanceof FormDataSchema) {
				body = schema.parse(await req.formData());
			} else if (schema) {
				body = schema.parse(await req.json());
			} else {
				body = await req.text();
			}
		} catch (e) {
			if (e instanceof SchemaError) return BadRequest(e.message);
			return BadRequest("Invalid request body");
		}

		const middlewareStack: AnyHandler[] = matchingRoutes.flatMap((r) =>
			(r.config.handlers[_use] ?? []).concat(r.config.handlers[method] ?? [])
		).concat([
			() => matchingRoutes.length > 0 ? MethodNotAllowed() : NotFound(),
		]);

		const ctx: RouterContext<StateType, unknown> = {
			url,
			params: matchingRoutes.reduce((a, b) => ({ ...a, ...b.params }), {}),
			state: {},
			request: req,
			query,
			getService: <T extends ServiceActions>(
				name: string | ServiceToken<T>,
			): Service<T> => {
				const svc = this._services.get(name as string);
				if (!svc) throw new Error(`Service "${name}" not registered`);
				return svc as Service<T>;
			},
			body,
			connection: info,
		};

		let index = 0;
		const executeMiddleware = async (): Promise<Response> => {
			if (index < middlewareStack.length) {
				const res = await middlewareStack[index++]?.(ctx, executeMiddleware);
				if (res instanceof Response) return res;
			}
			return new Response("End of stack", { status: 500 });
		};

		try {
			return await executeMiddleware();
		} catch {
			return InternalError();
		}
	}

	private findMatchingRoutes(url: URL) {
		return this.routes.values().map((route) => {
			const result = route.pattern.exec(url);
			if (result) return { config: route, params: result.pathname.groups };
		}).filter((r) => !!r).toArray();
	}

	// ─── Static file serving ───────────────────────────────────────────────────

	serveDirectory(
		dir: string,
		root: string,
		{
			flatten = false,
			showIndex = false,
			spa = false,
			queryable = false,
		}: {
			showIndex?: boolean;
			flatten?: boolean | RegExp;
			spa?: boolean;
			queryable?: boolean;
		} = {},
	): void {
		let effectiveDir = dir;
		if (flatten) {
			effectiveDir = flatten instanceof RegExp
				? dir.replace(flatten, "")
				: (dir.split("/").at(-1) ?? dir);
		}

		if (queryable) {
			this.get(root + "/_dir", async () => {
				const files: string[] = [];
				for await (const entry of Deno.readDir(effectiveDir)) {
					files.push(joinPath(entry.name));
				}
				return new Response(JSON.stringify(files), {
					headers: { "Content-Type": "application/json" },
				});
			});
		}

		this.route(root + "*").get((ctx) =>
			resolveStaticFile(effectiveDir, root, ctx.url.pathname, spa, showIndex)
		);
	}
}

export default Router;
