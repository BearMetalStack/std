import {
	Html,
	InternalError,
	NotFound,
	Ok,
	type RouterContext,
	type RouterHandler,
	Script,
	ServiceUnavailable,
	TrustedModule,
	Unauthorized,
} from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";
import meta from "./deno.json" with { type: "json" };
import { manifestSchema } from "./schema.ts";
import { Tracker } from "./metrics/track.ts";
import { sseResponse, wantsStream } from "./sse.ts";
import { renderPage } from "./page.ts";
import { clientScript } from "./client/embedded.ts";
import type {
	BuiltinMetric,
	DashManifest,
	HealthCheck,
	HealthOptions,
	HealthzBody,
	ManifestFactory,
} from "./types.ts";

/** Root of everything `@bearmetal/health` serves, apart from `/healthz`. */
export const HEALTH_BASE = "/@bearmetal/health";

/** Where the manifest (JSON) and the standalone dashboard (HTML) are served. */
export const DASHBOARD_PATH = `${HEALTH_BASE}/dashboard`;

/** Where the standalone dashboard's client script is served. */
export const CLIENT_SCRIPT_PATH = `${HEALTH_BASE}/assets/client.js`;

/** Environment variable the token defaults to. */
export const TOKEN_ENV = "BEARMETAL_HEALTH_TOKEN";

/** Version of this package, sent in the discovery ping's `x-bearmetal-health` header. */
export const VERSION: string = meta.version;

const METRICS = [
	"requests",
	"rps",
	"latency",
	"p50",
	"p95",
	"p99",
	"errors",
	"errorRate",
	"memory",
	"uptime",
] as const satisfies readonly BuiltinMetric[];

/**
 * Paths of the built-in metrics, for use as a module `source`:
 *
 * | Metric | Module type | Value |
 * |---|---|---|
 * | `requests` | `timeseries` | requests per bucket |
 * | `rps` | `stat` | requests per second over the window |
 * | `latency` | `histogram` | response times in ms |
 * | `p50` `p95` `p99` | `stat` | response time quantiles in ms |
 * | `errors` | `timeseries` | 5xx responses per bucket |
 * | `errorRate` | `stat` | percentage of requests that were 5xx |
 * | `memory` | `timeseries` | `rss` and `heapUsed` in bytes |
 * | `uptime` | `stat` | seconds since startup |
 *
 * Each answers a plain GET with its static payload, and streams with `?stream`.
 */
export const builtin: Readonly<Record<BuiltinMetric, string>> = Object.fromEntries(
	METRICS.map((m) => [m, `${HEALTH_BASE}/m/${m}`]),
) as Record<BuiltinMetric, string>;

/** The path a user handler registered under `key` is served at. */
export function handlerPath(key: `/${string}`): string {
	return `${HEALTH_BASE}/x${key}`;
}

function isBuiltin(name: string | undefined): name is BuiltinMetric {
	return (METRICS as readonly string[]).includes(name ?? "");
}

function envToken(): string | undefined {
	try {
		if (Deno.permissions.querySync({ name: "env", variable: TOKEN_ENV }).state !== "granted") {
			return undefined;
		}
		return Deno.env.get(TOKEN_ENV) || undefined;
	} catch {
		return undefined;
	}
}

function safeEqual(a: string, b: string): boolean {
	const x = new TextEncoder().encode(a);
	const y = new TextEncoder().encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}

function noStore(res: Response): Response {
	res.headers.set("Cache-Control", "no-store");
	return res;
}

/**
 * Serves `/healthz`, the `/@bearmetal/health` discovery ping, the built-in metrics, extra data
 * handlers, and (given a manifest) the dashboard. Build one with {@link healthModule}.
 *
 * Everything is registered with `absoluteRoute`, so mounting under a prefix moves nothing: an
 * aggregator always knows where to look.
 */
export class HealthModule extends TrustedModule {
	/** The request tracker behind the built-in metrics. */
	readonly tracker: Tracker;
	readonly #manifest?: ManifestFactory;
	readonly #token?: string;
	readonly #checks: Record<string, HealthCheck>;
	readonly #handlerPaths: Set<string>;
	readonly #started = Date.now();
	#sourcesChecked = false;
	#invalidWarned = false;

	constructor(manifest?: ManifestFactory, opts: HealthOptions = {}) {
		super("@bearmetal/health");
		this.#manifest = manifest;
		this.#token = opts.token ?? envToken();
		this.#checks = opts.checks ?? {};
		this.tracker = new Tracker(opts.track);
		this.#handlerPaths = new Set(
			Object.keys(opts.handlers ?? {}).map((k) => handlerPath(k as `/${string}`)),
		);

		if (this.tracker.tracking) this.use(this.tracker.middleware);

		this.absoluteRoute("/healthz").use(this.#healthz);
		this.absoluteRoute(HEALTH_BASE).get(() =>
			noStore(new Response("ok", { headers: { "x-bearmetal-health": VERSION } }))
		);
		this.absoluteRoute(`${HEALTH_BASE}/m/:metric`).get(this.#gate(this.#metric));

		for (const [key, handler] of Object.entries(opts.handlers ?? {})) {
			if (!key.startsWith("/")) {
				throw new TypeError(`healthModule handler keys must start with "/", got "${key}"`);
			}
			this.absoluteRoute(handlerPath(key as `/${string}`)).get(this.#gate(handler));
		}

		if (manifest) {
			this.absoluteRoute(DASHBOARD_PATH).get(this.#gate(this.#dashboard));
			this.absoluteRoute(CLIENT_SCRIPT_PATH).get(() => {
				const res = Script(clientScript);
				res.headers.set("Cache-Control", "public, max-age=3600");
				return res;
			});
		}
	}

	/** The token presented with the request, from `Authorization: Bearer` or `?token=`. */
	#presented(ctx: RouterContext): string | undefined {
		const header = ctx.request.headers.get("authorization");
		if (header?.startsWith("Bearer ")) return header.slice(7).trim();
		return ctx.query.token;
	}

	#gate(handler: RouterHandler): RouterHandler {
		return (ctx, next) => {
			if (this.#token) {
				const given = this.#presented(ctx);
				if (given === undefined || !safeEqual(given, this.#token)) {
					return Unauthorized(
						new Headers({ "WWW-Authenticate": 'Bearer realm="@bearmetal/health"' }),
					);
				}
			}
			return handler(ctx, next);
		};
	}

	/**
	 * Defers to the app's own `GET /healthz` when one exists. `next()` always resolves to a
	 * Response (the router ends every chain with a 404/405), so "exists" is read from `ctx.route`,
	 * and a 404 from a catch-all route that happened to match still falls back to the default.
	 */
	#healthz: RouterHandler = async (ctx, next) => {
		if (ctx.request.method !== "GET") return await next();
		if (ctx.route) {
			const res = await next();
			if (res.status !== 404) return res;
		}
		return await this.#defaultHealthz();
	};

	async #defaultHealthz(): Promise<Response> {
		const checks: Record<string, boolean> = {};
		await Promise.all(
			Object.entries(this.#checks).map(async ([name, check]) => {
				try {
					checks[name] = (await check()) === true;
				} catch {
					checks[name] = false;
				}
			}),
		);
		const ok = Object.values(checks).every(Boolean);
		const body: HealthzBody = {
			status: ok ? "ok" : "fail",
			uptime: Math.floor((Date.now() - this.#started) / 1000),
			checks,
		};
		return noStore(ok ? Ok(body) : ServiceUnavailable(body));
	}

	#metric: RouterHandler = (ctx) => {
		const name = ctx.params.metric;
		if (!isBuiltin(name) || !this.tracker.enabled(name)) {
			return NotFound(`No metric "${name}" is being tracked`);
		}
		if (wantsStream(ctx.request, ctx.url)) {
			const { every, events } = this.tracker.stream(name);
			return sseResponse((send) => {
				const tick = () => events().forEach((e) => send(e));
				tick();
				const id = setInterval(tick, every);
				return () => clearInterval(id);
			}, { signal: ctx.request.signal });
		}
		return noStore(Ok(this.tracker.snapshot(name)));
	};

	#dashboard: RouterHandler = async (ctx) => {
		const manifest = await this.#manifest!();
		const check = manifestSchema.safeParse(manifest);
		if (!check.success) {
			if (!this.#invalidWarned) {
				this.#invalidWarned = true;
				console.warn(
					`[@bearmetal/health] the dashboard manifest is invalid:\n\t` +
						check.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("\n\t"),
				);
			}
			if (isDev()) {
				return InternalError({ error: "Invalid dashboard manifest", issues: check.issues });
			}
		}
		this.#checkSources(manifest);

		if (wantsHtml(ctx.request, ctx.url)) {
			return noStore(
				Html(renderPage(manifest, { token: this.#token ? this.#presented(ctx) : undefined })),
			);
		}
		return noStore(Ok(manifest));
	};

	/** Warns, once, about sources in the reserved namespace that nothing here answers. */
	#checkSources(manifest: DashManifest): void {
		if (this.#sourcesChecked) return;
		this.#sourcesChecked = true;
		const known = new Set([
			...METRICS.filter((m) => this.tracker.enabled(m)).map((m) => builtin[m]),
			...this.#handlerPaths,
		]);
		const unknown = [...manifest.keyModules, ...manifest.modules]
			.filter((m) => m.source.startsWith(`${HEALTH_BASE}/`) && !known.has(m.source.split("?")[0]))
			.map((m) => `${m.id} → ${m.source}`);
		if (unknown.length) {
			console.warn(
				`[@bearmetal/health] these dashboard modules point at nothing healthModule serves ` +
					`(add a handler, or turn on the metric in track):\n\t${unknown.join("\n\t")}`,
			);
		}
	}
}

/** `?format=` wins; otherwise HTML only when the client asks for it, so `*` and curl get JSON. */
function wantsHtml(req: Request, url: URL): boolean {
	const format = url.searchParams.get("format");
	if (format) return format === "html";
	return (req.headers.get("accept") ?? "").includes("text/html");
}

/**
 * Mounts health checks, metrics, and a dashboard on an app:
 *
 * - `GET /healthz`: the app's own handler if it has one, else `{status, uptime, checks}`
 * - `GET /@bearmetal/health`: answers `ok`, so aggregators can discover the app
 * - `GET /@bearmetal/health/dashboard`: the manifest as JSON, or a basic dashboard as HTML
 *   (only when `manifest` is given)
 * - `GET /@bearmetal/health/m/:metric`: the {@link builtin} metrics turned on in `opts.track`
 * - `GET /@bearmetal/health/x/*`: `opts.handlers`
 *
 * Mount it before any catch-all route and early in the middleware chain, so `/healthz` gets a
 * look in and request timings cover the rest of the app.
 *
 * @example
 * ```ts
 * import { builtin, healthModule } from "@bearmetal/health";
 *
 * router.use(healthModule(() => ({
 *   schemaVersion: 1,
 *   identifier: "billing",
 *   name: "Billing",
 *   description: "Invoices and payments",
 *   keyModules: [{ id: "rps", _type: "stat", title: "Requests/s", source: builtin.rps, sourceType: "sse" }],
 *   modules: [],
 * }), { track: true }));
 * ```
 */
export function healthModule(manifest?: ManifestFactory, opts?: HealthOptions): HealthModule {
	return new HealthModule(manifest, opts);
}
