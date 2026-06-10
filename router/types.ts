/**
 * @module
 * BearMetal Router types
 */

export type StateType = Record<string, unknown>;

// deno-lint-ignore no-explicit-any
export type ServiceActions = Record<string, (...args: any[]) => unknown>;

/**
 * A branded string that carries its action types, allowing `ctx.getService()`
 * to infer the full `Service<T>` type without an explicit type parameter.
 *
 * Create one with `createServiceToken<T>(name)`.
 */
export type ServiceToken<T extends ServiceActions> = string & {
	__serviceToken: T;
};

/**
 * @description a named service that can be registered on the router and
 * retrieved from any handler via `ctx.getService()`.
 *
 * @example
 * ```ts
 * const emailService: Service<{ send: (to: string, body: string) => Promise<void> }> = {
 *   invoke: async (action, ...args) => { ... }
 * };
 * router.registerService("email", emailService);
 *
 * // in a handler:
 * const svc = ctx.getService<{ send: (to: string, body: string) => Promise<void> }>("email");
 * await svc.invoke("send", "user@example.com", "Hello!");
 * ```
 */
export interface Service<T extends ServiceActions = ServiceActions> {
	invoke<K extends keyof T & string>(
		action: K,
		...args: Parameters<T[K]>
	): ReturnType<T[K]>;
}

/**
 * @description a context object passed to every handler and middleware.
 * `TBody` reflects the parsed request body type - `string` by default,
 * or the inferred output of a schema when one is registered on the route.
 */
export interface RouterContext<
	T extends StateType = StateType,
	TBody = string,
> {
	url: URL;
	params: Record<string, string | undefined>;
	state: T;
	request: Request;
	/** Parsed request body. Type is `string` unless a schema is registered on the route. */
	body: TBody;
	/** Raw query parameters from the URL. Always available regardless of schema. */
	query: Record<string, string>;
	getService<T extends ServiceActions = ServiceActions>(
		name: string | ServiceToken<T>,
	): Service<T>;
	connection: Deno.ServeHandlerInfo<Deno.Addr>;
	cookies: Map<string, string>;
}

/**
 * @description a route handler or middleware function.
 * The `next` parameter calls the next handler in the chain - omit it for terminal handlers.
 */
export type RouterHandler<T extends StateType = StateType, TBody = string> = (
	ctx: RouterContext<T, TBody>,
	next: () => Promise<Response>,
) => Promise<Response> | Response;
