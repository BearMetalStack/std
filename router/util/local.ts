/**
 * @module
 * Serving a router as the backend of a local (desktop) app.
 */

import { Forbidden } from "./response.ts";

/** Options for {@linkcode localGuard} and {@linkcode serveLocal}. */
export interface LocalGuardOptions {
	/**
	 * Extra origins allowed to make state-changing requests, e.g. a dev server on another port
	 * (`"http://localhost:5173"`). The server's own origin is always allowed.
	 */
	allowedOrigins?: string[];
	/**
	 * Extra hostnames accepted in the `Host` header. Loopback names (`localhost`, `127.0.0.1`,
	 * `[::1]`) are always accepted.
	 */
	allowedHosts?: string[];
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostnameOf(host: string): string {
	if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
	return host.split(":")[0];
}

/**
 * Checks a request against what a loopback-only server should accept, returning a 403 `Response`
 * to refuse it or `null` to let it through:
 *
 * - the `Host` header must name a loopback host (or one in `allowedHosts`), which is what stops a
 *   DNS-rebinding page from reaching the server under its own hostname;
 * - a state-changing method (anything but `GET`/`HEAD`/`OPTIONS`) carrying an `Origin` must come
 *   from the server's own origin or one in `allowedOrigins`, which stops any other web page from
 *   posting to it. Requests without an `Origin` (curl, a CLI, a native shell) pass.
 *
 * Usable as router middleware: `router.use((ctx, next) => localGuard(ctx.request) ?? next())`.
 */
export function localGuard(req: Request, options: LocalGuardOptions = {}): Response | null {
	const host = req.headers.get("host");
	if (host) {
		const name = hostnameOf(host).toLowerCase();
		if (!LOOPBACK_HOSTS.has(name) && !options.allowedHosts?.includes(name)) {
			return Forbidden("Host not allowed");
		}
	}
	if (SAFE_METHODS.has(req.method)) return null;
	const origin = req.headers.get("origin");
	if (origin === null) return null;
	const own = host ? [`http://${host}`, `https://${host}`] : [new URL(req.url).origin];
	if (own.includes(origin) || options.allowedOrigins?.includes(origin)) return null;
	return Forbidden("Cross-origin request refused");
}

/** Options for {@linkcode serveLocal}. */
export interface ServeLocalOptions extends LocalGuardOptions {
	/** Port to listen on; `0` (the default) lets the OS pick a free one. */
	port?: number;
	/** Loopback address to bind. Defaults to `127.0.0.1`. */
	hostname?: "127.0.0.1" | "localhost" | "::1";
	/** Called once listening, with the bound address. */
	onListen?: (addr: Deno.NetAddr) => void;
	/** Aborts the server. */
	signal?: AbortSignal;
}

/**
 * `Deno.serve` for a local app backend: binds loopback rather than `Deno.serve`'s `0.0.0.0`
 * default, and runs every request through {@linkcode localGuard} first.
 *
 * ```ts
 * const server = serveLocal(router, { port: 0, onListen: ({ port }) => openWindow(port) });
 * ```
 */
export function serveLocal(
	router: { readonly handle: Deno.ServeHandler },
	options: ServeLocalOptions = {},
): Deno.HttpServer<Deno.NetAddr> {
	const { port = 0, hostname = "127.0.0.1", onListen, signal } = options;
	const handle = router.handle;
	return Deno.serve({
		port,
		hostname,
		signal,
		onListen: onListen ?? (() => {}),
	}, (req, info) => localGuard(req, options) ?? handle(req, info));
}
