/**
 * @module
 *
 * Dev proxy integration for BearMetal router apps. Registers a local server
 * with the shared dev proxy (`BEARMETAL_PROXY_HOST`) so inbound traffic is
 * forwarded to it during development.
 *
 * In non-dev environments (`BEARMETAL_ENV !== "dev"`) all exports are safe to
 * call — they become no-ops so this module can be used unconditionally in
 * shared entrypoints.
 *
 * Requires `--allow-env=BEARMETAL_PROXY_HOST,BEARMETAL_ENV` and
 * `--allow-net` for the proxy claim request.
 *
 * @example
 * ```ts
 * import { claimDevProxy } from "@bearmetal/devproxy";
 *
 * await claimDevProxy("localhost", 3000);
 * ```
 *
 * @example
 * ```ts
 * import { devProxyModule } from "@bearmetal/devproxy";
 * import { Router } from "@bearmetal/router";
 * const router = new Router();
 * router.use(devProxyModule("proxy")); // project should be available at 'http://proxy.<BEARMETAL_PROXY_HOST>'
 * ```
 */
import { Module, Ok } from "@bearmetal/router";
import { HEALTH_ENDPOINT } from "./consts.ts";
import { isDev, isEnvGranted } from "@bearmetal/miscellanea";

let proxyHost: string;
const fallbackHost = "https://dev.bear-metal.dev";
try {
	proxyHost = Deno.env.get("BEARMETAL_PROXY_HOST") ?? fallbackHost;
} catch {
	console.warn(
		"%c[BearMetal devproxy] %cNo --allow-env permission; recommend adding --allow-env=BEARMETAL_PROXY_HOST,BEARMETAL_ENV. Falling back to " +
			fallbackHost,
		"color: green",
		"color: white",
	);
	proxyHost = fallbackHost;
}
/**
 * Registers this local server with the dev proxy so that traffic from the
 * shared `BEARMETAL_PROXY_HOST` is forwarded to `host:port`.
 *
 * @param host - The hostname the local server is listening on.
 * @param port - The port the local server is listening on.
 * @returns `true` if the proxy acknowledged the claim, `false` otherwise.
 */
export async function claimDevProxy(
	host: string,
	port: number,
): Promise<boolean> {
	const res = await fetch(proxyHost + "/__claim", {
		method: "POST",
		body: JSON.stringify({ target: host, port }),
		headers: {
			"Content-Type": "application/json",
		},
	});
	if (await res.text() === "claimed") return true;
	return false;
}

/**
 * Returns a router {@link Module} that integrates dev proxy support.
 *
 * In non-dev environments (`BEARMETAL_ENV !== "dev"`) the returned module is a
 * no-op so this function is safe to call unconditionally in shared entrypoints.
 *
 * When active the module:
 * - Claims the dev proxy on startup via {@link claimDevProxy}.
 * - Exposes a health check at {@link HEALTH_ENDPOINT} (`GET /__dev/health`).
 *
 * @param hostname - The hostname the local server is listening on.
 * @param port - The port the local server is listening on.
 * @returns A configured {@link Module} ready to be mounted on a router.
 */
export function devProxyModule(hostname: string, port: number): Module {
	const mod = new Module();
	// let bearmEnv = "dev";
	// try {
	//   bearmEnv = Deno.env.get("BEARMETAL_ENV") ?? "dev";
	if (!isEnvGranted()) {
		console.warn(
			"%c[BearMetal devproxy] %cNo --allow-env permission; recommend adding --allow-env=BEARMETAL_PROXY_HOST,BEARMETAL_ENV. Treating env as dev.",
			"color: green",
			"color: white",
		);
	}
	if (isDev()) return mod;
	mod
		.onStart(async () => {
			await claimDevProxy(hostname, port);
			console.log(
				`%c[BearMetal devproxy] %cProject available at %chttps://${hostname}.${proxyHost}`,
				"color: green",
				"color: white",
				"color: cyan",
			);
		})
		.route(HEALTH_ENDPOINT).get(() => Ok());
	return mod;
}

if (import.meta.main) {
	claimDevProxy("bingbong", 8000);
}
