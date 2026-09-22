import { joinPath } from "@bearmetal/miscellanea";
import { isDev } from "@bearmetal/miscellanea/environment";
import { contributeHead } from "@bearmetal/app/ssr";
import { Module, type RouterHandler, TrustedModule } from "@bearmetal/router";
import { BASE, clientScript, devServerSourceUrl } from "./client.ts";
import {
	type AliasResolver,
	buildVendor,
	type CompiledModule,
	compileModules,
	CSS_MODULE_QUERY,
	findConfigDir,
	isScript,
	loadLocalAliases,
	type VendorBuild,
} from "./graph.ts";
import { headTags, importMapJson } from "./head.tsx";
import type { DevServerOptions, Lazy } from "./types.ts";

const SETTLE_MS = 50;
const HOT_MODULE = /@define\s*\(/;
const MODULE_SCRIPT = /<script\b[^>]*\btype\s*=\s*["']?module["']?[^>]*>/gi;
const SRC = /\bsrc\s*=\s*["']([^"']+)["']/i;
const DEFAULT_SHELL =
	`<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body></body>\n</html>\n`;

/**
 * A dev server as a router `Module`, mounted into an app's own router instead
 * of running as a second `Deno.serve` process.
 *
 * Serves `root` as-is, compiling scripts one module at a time so the browser
 * loads each dependency once through an import map, and keeps the page in sync
 * over server-sent events:
 *
 * - a stylesheet the page links is swapped in place;
 * - a module that declares a component with `@define` is re-imported, and
 *   `@bearmetal/app` replaces every live instance with one built from the new
 *   class, carrying `@state` and `@prop` across;
 * - anything else the page loaded reloads it. Files the page never requested
 *   are ignored.
 *
 * With `entry` set it hosts an SPA: any navigation that isn't a file gets the
 * shell, so client-side routes survive a reload. Link assets from the shell
 * with root-relative URLs, since the shell is served at every depth.
 *
 * Pages rendered with `Page()` from `@bearmetal/app/ssr` get the import map,
 * the client and the entry through `contributeHead()`, ahead of their own tags.
 *
 * Inert unless `isDev()` — `BEARMETAL_ENV` unset or `"dev"`, with env access
 * granted — so it is safe to mount unconditionally. Unless `mount` is
 * `false` it registers a `"*"` catch-all under its mount point, and it always
 * registers its own routes under the reserved `/@bearmetal/dev-server/*`, so
 * mount at most one per app.
 *
 * @example
 * ```ts
 * router.use("/app", devServerModule({ root: "client", entry: "main.tsx" }));
 * ```
 */
export function devServerModule(options: DevServerOptions = {}): Module {
	if (!isDev()) {
		console.warn(
			'devServerModule is disabled: BEARMETAL_ENV is not "dev", or env access to it was not granted.',
		);
		return new Module();
	}
	return new DevServerModule(options);
}

class DevServerModule extends TrustedModule {
	#root = "";
	#entryPaths: string[] = [];
	#shell: string | undefined;
	#aliases: AliasResolver = () => undefined;
	#cwd = Deno.cwd();
	#modules = new Map<string, CompiledModule>();
	#served = new Map<string, Set<string>>();
	#entries = new Set<string>();
	#vendor: VendorBuild | undefined;
	#vendorBuild: Promise<VendorBuild | undefined> = Promise.resolve(undefined);
	#bus = new EventTarget();

	#options: DevServerOptions;

	constructor(options: DevServerOptions) {
		super("@bearmetal/dev-server");
		this.#options = options;

		this.onStart(async () => {
			this.#root = await Deno.realPath(await resolve(options.root) ?? ".");
			this.#aliases = await loadLocalAliases(this.#root);
			this.#cwd = await findConfigDir(this.#root) ?? Deno.cwd();
			if (options.shell) this.#shell = joinPath(this.#root, options.shell);
			else if (await isFile(joinPath(this.#root, "index.html"))) {
				this.#shell = joinPath(this.#root, "index.html");
			}
			await this.#refreshVendor();
			const inject = options.injectEntry ?? true;
			contributeHead(
				() =>
					headTags(
						this.#vendor?.imports ?? {},
						inject ? this.#entryPaths.map((p) => this.#srcUrl(p)) : [],
					),
				{ at: "start" },
			);
			this.#watch().catch((e) => console.error("[bmdev] stopped watching:", e));
		});

		this.absoluteRoute(`${BASE}/events`).get(() => this.#events());
		this.absoluteRoute(`${BASE}/client.js`).get(() => respond(clientScript, "text/javascript"));
		this.absoluteRoute(`${BASE}/vendor/*`).get((ctx) => this.#vendorFile(ctx.url.pathname));
		this.absoluteRoute(`${BASE}/src/*`).get((ctx) =>
			this.#serveFile(
				ctx.url,
				decodeURIComponent(ctx.url.pathname.slice(`${BASE}/src/`.length)),
				`${BASE}/src/`,
			)
		);

		if (options.mount === false) return;
		const serve: RouterHandler = (ctx) => this.#serve(ctx.request, ctx.url, ctx.params["0"] ?? "");
		this.route("/").get(serve);
		this.route("*").get(serve);
	}

	// #region serving

	async #serve(req: Request, url: URL, rel: string): Promise<Response> {
		rel = rel.replace(/^\/+/, "");
		const base = url.pathname.slice(0, url.pathname.length - rel.length).replace(/\/*$/, "/");
		const file = await this.#serveFile(url, rel, base);
		if (file.status !== 404 || !this.#entryPaths.length || !isNavigation(req, rel)) return file;

		try {
			const shell = this.#shell ? await Deno.readTextFile(this.#shell) : DEFAULT_SHELL;
			if (this.#shell) this.#track(this.#shell, url.pathname);
			return respond(await this.#page(shell, url, base), "text/html");
		} catch (e) {
			return failed(e);
		}
	}

	/** Serves the file under `root` at `rel`, which was requested as `url` from under `base`. */
	async #serveFile(url: URL, rel: string, base: string): Promise<Response> {
		const path = joinPath(this.#root, rel || "index.html");
		if (path !== this.#root && !path.startsWith(`${this.#root}/`)) return notFound();
		try {
			if (!(await isFile(path))) return notFound();
			this.#track(path, url.pathname);
			if (isScript(path)) return respond(await this.#module(path), "text/javascript");
			if (mimeType(path) === "text/css" && url.search === `?${CSS_MODULE_QUERY}`) {
				return respond(cssModule(url.pathname), "text/javascript");
			}
			if (mimeType(path) === "text/html") {
				return respond(await this.#page(await Deno.readTextFile(path), url, base), "text/html");
			}
			return respond(await Deno.readFile(path), mimeType(path));
		} catch (e) {
			return failed(e);
		}
	}

	/** Where `path` under `root` is served regardless of the mount point. */
	#srcUrl(path: string): string {
		return devServerSourceUrl(path.slice(this.#root.length + 1));
	}

	async #compile(path: string): Promise<CompiledModule> {
		return (await this.#compileAll([path])).get(path)!;
	}

	/** Compiles `paths` in one bundler run, without caching them. */
	async #compileAll(paths: string[]): Promise<Map<string, CompiledModule>> {
		const compiled = await compileModules(paths, this.#cwd, this.#aliases);
		const transform = this.#options.transform;
		if (transform) {
			for (const [path, c] of compiled) compiled.set(path, { ...c, code: transform(c.code) });
		}
		return compiled;
	}

	/**
	 * Re-reads the entries and brings the vendor build up to date with every
	 * module graph the server knows of.
	 */
	async #refreshVendor(): Promise<void> {
		try {
			const entry = await resolve(this.#options.entry);
			const paths = entry === undefined ? [] : Array.isArray(entry) ? entry : [entry];
			this.#entryPaths = await Promise.all(
				paths.map((p) =>
					Deno.realPath(joinPath(this.#root, p)).catch(() => joinPath(this.#root, p))
				),
			);
			this.#entryPaths.forEach((p) => this.#entries.add(p));
			await this.#ensureVendor(await this.#crawl(this.#entries));
		} catch (e) {
			console.error("[bmdev]", e instanceof Error ? e.message : e);
		}
	}

	async #module(path: string): Promise<string> {
		let compiled = this.#modules.get(path);
		if (!compiled) {
			compiled = await this.#compile(path);
			this.#modules.set(path, compiled);
		}
		return compiled.code;
	}

	/**
	 * Prepares an HTML page: loads the entry if the page does not, compiles its
	 * whole module graph so the vendor build covers every package it imports,
	 * and injects the import map and client ahead of everything else.
	 */
	async #page(html: string, url: URL, base: string): Promise<string> {
		const entries = new Set<string>();
		for (const tag of html.matchAll(MODULE_SCRIPT)) {
			const src = tag[0].match(SRC)?.[1];
			const file = src && this.#fileOf(new URL(src, url).pathname, base);
			if (file) entries.add(file);
		}

		let tail = "";
		if (this.#options.injectEntry ?? true) {
			for (const entry of this.#entryPaths) {
				if (entries.has(entry)) continue;
				entries.add(entry);
				tail += `<script type="module" src="${base}${
					entry.slice(this.#root.length + 1)
				}"></script>`;
			}
		}
		entries.forEach((e) => this.#entries.add(e));

		const vendor = await this.#ensureVendor(await this.#crawl(entries));
		const head = `<script type="importmap">${
			importMapJson(vendor?.imports ?? {})
		}</script><script src="${BASE}/client.js"></script>`;

		const withHead = /<head\b[^>]*>/i.test(html)
			? html.replace(/<head\b[^>]*>/i, (m) => m + head)
			: head + html;
		if (!tail) return withHead;
		return /<\/head>/i.test(withHead)
			? withHead.replace(/<\/head>/i, `${tail}</head>`)
			: withHead + tail;
	}

	/** The file under `root` that a request for `pathname` would serve, if any. */
	#fileOf(pathname: string, base: string): string | undefined {
		if (!pathname.startsWith(base)) return undefined;
		return joinPath(this.#root, decodeURIComponent(pathname.slice(base.length)));
	}

	/** Every bare specifier reachable from `entries` through local imports. */
	/**
	 * Walks the graph a layer at a time, compiling each layer's uncached modules
	 * in one bundler run — a process per module would dominate startup.
	 */
	async #crawl(entries: Set<string>): Promise<Set<string>> {
		const bare = new Set<string>();
		const seen = new Set<string>();
		let layer = [...entries];
		while (layer.length) {
			const paths: string[] = [];
			for (const path of layer) {
				if (seen.has(path) || !isScript(path) || !(await isFile(path))) continue;
				seen.add(path);
				paths.push(path);
			}
			const missing = paths.filter((p) => !this.#modules.has(p));
			for (const [path, compiled] of await this.#compileAll(missing)) {
				this.#modules.set(path, compiled);
			}
			layer = [];
			for (const path of paths) {
				const compiled = this.#modules.get(path)!;
				compiled.bare.forEach((s) => bare.add(s));
				layer.push(...compiled.local);
			}
		}
		return bare;
	}

	/** Rebuilds the vendor bundle if `needed` has anything the current one lacks. */
	#ensureVendor(needed: Set<string>): Promise<VendorBuild | undefined> {
		this.#vendorBuild = this.#vendorBuild.catch(() => undefined).then(async () => {
			const current = this.#vendor;
			if (current && [...needed].every((s) => current.specifiers.has(s))) return current;
			if (!current && needed.size === 0) return undefined;
			const specs = new Set([...(current?.specifiers ?? []), ...needed]);
			const start = performance.now();
			const vendor = await buildVendor(specs, `${BASE}/vendor`, this.#cwd);
			const transform = this.#options.transform;
			if (transform) {
				for (const [name, code] of vendor.files) vendor.files.set(name, transform(code));
			}
			this.#vendor = vendor;
			console.log(
				`[bmdev] vendored ${specs.size} package specifier(s) in ${
					Math.round(performance.now() - start)
				}ms`,
			);
			return this.#vendor;
		});
		return this.#vendorBuild;
	}

	#vendorFile(pathname: string): Response {
		const [id, ...name] = pathname.slice(`${BASE}/vendor/`.length).split("/");
		const code = this.#vendor?.id === Number(id)
			? this.#vendor.files.get(name.join("/"))
			: undefined;
		return code === undefined ? notFound() : respond(code, "text/javascript");
	}

	#events(): Response {
		let send: (e: Event) => void;
		const body = new ReadableStream<Uint8Array>({
			start: (controller) => {
				const encoder = new TextEncoder();
				send = (e) => controller.enqueue(encoder.encode((e as CustomEvent<string>).detail));
				this.#bus.addEventListener("send", send);
			},
			cancel: () => this.#bus.removeEventListener("send", send),
		});
		return new Response(body, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				"Connection": "keep-alive",
			},
		});
	}

	#send(event: string, data: unknown): void {
		const detail = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
		this.#bus.dispatchEvent(new CustomEvent("send", { detail }));
	}

	#track(path: string, pathname: string): void {
		const urls = this.#served.get(path) ?? new Set<string>();
		urls.add(pathname);
		this.#served.set(path, urls);
	}

	// #endregion

	// #region watching

	async #watch(): Promise<void> {
		const pending = new Set<string>();
		let timer: ReturnType<typeof setTimeout> | undefined;
		for await (const event of Deno.watchFs(this.#root, { recursive: true })) {
			if (event.kind === "access" || event.kind === "other") continue;
			event.paths.forEach((p) => pending.add(p));
			clearTimeout(timer);
			timer = setTimeout(() => {
				const batch = [...pending];
				pending.clear();
				this.#changed(batch).catch((e) => console.error("[bmdev]", e));
			}, SETTLE_MS);
		}
	}

	/**
	 * Decides what a settled batch of changes needs: stylesheet swaps, component
	 * replacements, or — for anything else the page loaded — a reload.
	 */
	async #changed(paths: string[]): Promise<void> {
		const css = new Set<string>();
		const hot = new Set<string>();
		let reload: string | undefined;

		for (const path of paths) {
			const name = path.slice(this.#root.length + 1);
			if (this.#vendor?.sources.has(path)) {
				this.#vendor = undefined;
				reload ??= `${name} is part of the vendor build`;
				continue;
			}

			const urls = this.#served.get(path);
			if (!urls) continue;
			this.#modules.delete(path);

			if (!(await isFile(path))) {
				reload ??= `${name} was removed`;
			} else if (mimeType(path) === "text/css") {
				urls.forEach((u) => css.add(u));
			} else if (!isScript(path)) {
				reload ??= `${name} changed`;
			} else if (this.#entries.has(path)) {
				reload ??= `${name} is an entry module`;
			} else if (!HOT_MODULE.test(await Deno.readTextFile(path))) {
				reload ??= `${name} declares no component`;
			} else {
				const next = await this.#compile(path).catch((e: Error) => e);
				if (next instanceof Error) {
					console.error(`[bmdev] ${next.message}`);
					continue;
				}
				if (next.bare.some((s) => !this.#vendor?.specifiers.has(s))) {
					reload ??= `${name} imports a new package`;
					continue;
				}
				this.#modules.set(path, next);
				urls.forEach((u) => hot.add(u));
			}
		}

		if (reload) {
			await this.#refreshVendor();
			console.log(`[bmdev] reload: ${reload}`);
			this.#send("reload", { reason: reload });
			return;
		}
		if (css.size) {
			console.log(`[bmdev] css: ${[...css].join(", ")}`);
			this.#send("css-update", { paths: [...css] });
		}
		if (hot.size) {
			console.log(`[bmdev] hot: ${[...hot].join(", ")}`);
			this.#send("js-update", { paths: [...hot] });
		}
	}

	// #endregion
}

/**
 * What a module's `import "./x.css"` is answered with: a module that links the
 * stylesheet, once, so it is swapped in place like any other linked one.
 */
function cssModule(pathname: string): string {
	const href = JSON.stringify(pathname);
	return `if (![...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => new URL(l.href).pathname === ${href})) {
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = ${href};
	document.head.append(link);
}
`;
}

function respond(body: BodyInit, type: string): Response {
	return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "no-cache" } });
}

async function resolve<T>(value: Lazy<T> | undefined): Promise<T | undefined> {
	return typeof value === "function" ? await (value as () => T | Promise<T>)() : value;
}

function failed(e: unknown): Response {
	console.error(e);
	return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
}

function notFound(): Response {
	return new Response(null, { status: 404 });
}

function isNavigation(req: Request, rel: string): boolean {
	return req.method === "GET" && (req.headers.get("accept") ?? "").includes("text/html") &&
		!/\.[a-z0-9]+$/i.test(rel.split("/").pop() ?? "");
}

async function isFile(path: string): Promise<boolean> {
	try {
		return (await Deno.stat(path)).isFile;
	} catch {
		return false;
	}
}

const MIME: Record<string, string> = {
	html: "text/html",
	htm: "text/html",
	css: "text/css",
	js: "text/javascript",
	mjs: "text/javascript",
	json: "application/json",
	map: "application/json",
	svg: "image/svg+xml",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	ico: "image/x-icon",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
	wasm: "application/wasm",
	txt: "text/plain",
	md: "text/markdown",
	mp4: "video/mp4",
	webm: "video/webm",
	mp3: "audio/mpeg",
};

function mimeType(path: string): string {
	return MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
