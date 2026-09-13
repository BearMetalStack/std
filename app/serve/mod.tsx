/**
 * The runtime half of `@bearmetal/app`'s client delivery: the module that
 * gets an app's components, shared modules, and per-route orchestration into
 * the browser.
 *
 * One bundle for the whole app, built from `@components`/`@app`/`@pages`,
 * served from the reserved `/@bearmetal/components` endpoint and referenced
 * from every page's `<head>`. Both halves of that matter:
 *
 * - **Whole app, not per page.** A bundle assembled from the tags one page
 *   happened to render is missing everything the *next* page needs, which
 *   stops mattering the moment a client-side `<Router>` navigates without a
 *   reload.
 * - **Referenced, not inlined.** One file the browser caches once beats the
 *   same bytes pasted into every HTML response, which no cache can reuse.
 *
 * @module
 */

import {
	bundleEntrypoints,
	contributeHead,
	contributeRouteHead,
	mirrorStripped,
} from "../ssr/mod.ts";
import { getAllStylesheets } from "../define.ts";
import { type Module, Script, Style, TrustedModule } from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";
import {
	appJsxImportSource,
	defaultBundleName,
	type Entrypoint,
	findAppDir,
	findComponentsDir,
	findPagesDir,
	localImportAliases,
	type Resolved,
	resolveEntrypoints,
	serveMap,
} from "./discovery.ts";
import { resolveForRoute } from "./routeResolution.ts";

export * from "./discovery.ts";
export * from "./routeResolution.ts";

/** URL prefix that the component bundle and shared chunks are served under. */
export const componentsEndpoint = "/@bearmetal/components";

/** Served name of the stylesheet holding every component's CSS. */
const stylesheetName = `${defaultBundleName}.css`;

/** Loads a module for its `@define` side effects. */
export type ImportFn = (specifier: string) => Promise<unknown>;

/** How {@linkcode appModule} finds and serves an app's client code. */
export interface AppModuleOptions {
	/**
	 * How to import a component module.
	 *
	 * Defaults to a plain dynamic import, which is what you want. Pass
	 * `(s) => import(s)` from the app itself if its components need to resolve
	 * against an import map this package cannot see.
	 */
	import?: ImportFn;
	/** Where the components live. Defaults to `components/`, then `src/components/`. */
	componentsDir?: string;
	/** Where shared modules live. Defaults to `app/`, then `src/app/`. */
	appDir?: string;
	/** Where per-route orchestration lives. Defaults to `pages/`, then `src/pages/`. */
	pagesDir?: string;
}

/** Serves the client bundle at the reserved `/@bearmetal/components` endpoint. */
class AppModule extends TrustedModule {
	constructor() {
		super("@bearmetal/components");
	}
}

/**
 * Everything an app needs to ship its components, shared modules, and
 * per-route orchestration to the browser.
 *
 * Mount it above the routes that render pages:
 *
 * ```ts
 * router.use(appModule()).use(page);
 * ```
 *
 * On start it finds `@components`/`@app`/`@pages`, imports every discovered
 * component — so a tag can be used in a template without the view importing
 * anything — bundles everything in one pass, and registers the `<link>` and
 * `<script>` that `Page()` puts in every `<head>`, plus a per-route
 * `<meta name="bm-page">` dispatch tag for pages whose route resolves to a
 * `@pages` module.
 */
export function appModule(options: AppModuleOptions | ImportFn = {}): Module {
	const opts: AppModuleOptions = typeof options === "function" ? { import: options } : options;
	const importModule: ImportFn = opts.import ?? ((specifier) => import(specifier));

	const bus = new EventTarget();
	/** Bundles keyed by the name they are served under at the components endpoint. */
	let compBundle: Map<string, string> = new Map();
	let compStyles = "";
	/** Cache buster for the entry URL; the bundler already content-hashes chunk names. */
	let version = "";
	let resolved: Resolved = {
		entrypoints: [],
		sideEffects: [],
		componentManifestKeys: new Set(),
		pageKeys: new Set(),
	};

	// Claims the `/@bearmetal/components` namespace, which the router reserves.
	// The class name is what the router reports, so it is declared rather than anonymous.
	const mod = new AppModule();

	mod.onStart(async () => {
		const componentsDir = await findComponentsDir(opts.componentsDir);
		const appDir = await findAppDir(opts.appDir);
		const pagesDir = await findPagesDir(opts.pagesDir);

		if (!componentsDir && !appDir && !pagesDir) {
			console.warn(
				"@bearmetal/app found no components/, app/, or pages/ directory (looked relative " +
					"to where the server was started), so no client bundle was built and nothing " +
					"will hydrate.",
			);
			return;
		}

		// The bundler reads a stripped mirror of the components directory, never
		// the real files: emptying `serverInit` in the *output* leaves everything
		// it imported in the bundle, because by then the graph has been walked.
		// `@app`/`@pages` have no server-only code to strip, so they bundle
		// straight from their real paths.
		const stripped = componentsDir
			? await mirrorStripped(componentsDir, {
				jsxImportSource: await appJsxImportSource(),
				imports: await localImportAliases(),
			})
			: undefined;
		let synthesized: string | undefined;

		/**
		 * Re-mirrors, re-resolves and rebuilds, in that order.
		 *
		 * All three, every time, because in dev any of them can have changed: a
		 * source file, the set of files, or a manifest. The mirror is refreshed
		 * in place so the entrypoint path resolved against it stays valid.
		 */
		const build = async () => {
			await stripped?.refresh();
			resolved = await resolveEntrypoints(componentsDir, appDir, pagesDir, stripped?.root ?? null);

			if (synthesized && synthesized !== resolved.tempDir) {
				await Deno.remove(synthesized, { recursive: true }).catch(() => {});
			}
			synthesized = resolved.tempDir;
			if (resolved.entrypoints.length === 0) return;

			// Importing components registers them with the microdom and records
			// their stylesheets, which is what lets a view write `<my-thing />`
			// without importing anything. These are the originals — the server
			// needs the halves the bundle is not allowed to have. Already-imported
			// modules are a no-op, so this only ever picks up new files.
			await Promise.all(resolved.sideEffects.map(importModule));

			const { scripts, styles } = await bundleEntrypoints(resolved.entrypoints.map((e) => e.path));
			compBundle = serveMap(resolved.entrypoints, scripts);
			// Component stylesheets come from the server-side registry rather than
			// the bundle, because the bundler strips them on the way out — they
			// are wanted in the first paint, not after the module that declares
			// them has loaded.
			compStyles = [getAllStylesheets(), styles].filter(Boolean).join("\n");
			version = await fingerprint(compBundle.get(defaultBundleName) ?? "", compStyles);
		};

		await build();

		if (resolved.entrypoints.length === 0) {
			console.warn(
				"@bearmetal/app found nothing to bundle in components/, app/, or pages/.",
			);
			await stripped?.dispose();
			return;
		}

		contributeHead(() => headTags(resolved.entrypoints));
		contributeRouteHead(routeMeta);

		const watchedDirs = [componentsDir, appDir, pagesDir].filter((d): d is string => d !== null);

		if (isDev()) {
			bus.addEventListener("modify", () => {
				build()
					.then(() => bus.dispatchEvent(new Event("reload")))
					.catch((e) => console.error("failed to rebuild the client bundle:", e));
			});
			for (const dir of watchedDirs) {
				watch(dir).catch((e) => console.error(`stopped watching ${dir}:`, e));
			}
		} else {
			// Nothing rebuilds in production, so neither copy is needed again.
			await stripped?.dispose();
			if (synthesized) await Deno.remove(synthesized, { recursive: true }).catch(() => {});
		}
	});

	mod.route(`${componentsEndpoint}/:bundle`)
		.get(async (ctx, next) => {
			const name = ctx.params.bundle as string;
			if (name === stylesheetName) return cache(Style(compStyles));
			const script = compBundle.get(name);
			if (script === undefined) return await next();
			return cache(Script(script));
		});

	/** The default bundle is the only one referenced; shared chunks are pulled in by the entry that imports them. */
	function headTags(entrypoints: Entrypoint[]) {
		const tags = [];
		if (compStyles) {
			tags.push(
				<link rel="stylesheet" href={`${componentsEndpoint}/${stylesheetName}?v=${version}`} />,
			);
		}
		if (entrypoints.some((e) => e.served === defaultBundleName)) {
			tags.push(
				<script
					type="module"
					src={`${componentsEndpoint}/${defaultBundleName}?v=${version}`}
				/>,
			);
		}
		if (isDev()) tags.push(<script $raw>{reloadScript}</script>);
		return tags;
	}

	/** Said once per unresolved route, however many times it renders. */
	const warnedRoutes = new Set<string>();

	/** Resolves the `@pages` dispatch key for the matched route, if any. */
	function routeMeta(route: string | undefined) {
		if (!route) return null;
		const resolution = resolveForRoute(route, resolved.pageKeys, resolved.componentManifestKeys);

		if (
			isDev() && resolved.componentManifestKeys.size > 0 && !resolution.componentManifest &&
			!warnedRoutes.has(route)
		) {
			warnedRoutes.add(route);
			console.warn(
				`No @components manifest resolves for route "${route}", and no main.manifest.ts ` +
					"fallback exists either — add @components/main.manifest.ts.",
			);
		}

		if (!resolution.page) return null;
		return <meta name="bm-page" content={resolution.page} />;
	}

	if (isDev()) {
		mod.route("/__event/reload")
			.get(() => {
				let listener: (e: Event) => void;
				const body = new ReadableStream({
					start(controller) {
						listener = () => {
							const ev = `event: reload\ndata: ${Date.now()}\n\n`;
							controller.enqueue(new TextEncoder().encode(ev));
						};
						bus.addEventListener("reload", listener);
					},
					cancel() {
						bus.removeEventListener("reload", listener);
					},
				});
				return new Response(body, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						"Connection": "keep-alive",
					},
				});
			});
	}

	async function watch(dir: string) {
		for await (const fEvent of Deno.watchFs(dir, { recursive: true })) {
			if (fEvent.kind === "modify") {
				bus.dispatchEvent(new Event("modify"));
			}
		}
	}

	return mod;
}

/**
 * The bundle URL carries a content hash, so the answer can be cached forever.
 * In dev it must not be cached at all — the URL is the same across a rebuild
 * whenever the hash happens not to change.
 */
function cache(res: Response): Response {
	res.headers.set(
		"Cache-Control",
		isDev() ? "no-store" : "public, max-age=31536000, immutable",
	);
	return res;
}

/** Short content hash, enough to bust a cache when the bundle moves. */
async function fingerprint(...parts: string[]): Promise<string> {
	const data = new TextEncoder().encode(parts.join(" "));
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest).slice(0, 6)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Reloads the page when the server comes back.
 *
 * The interesting case is not the `reload` event but the error: `deno run
 * --watch` restarts the process on a change, which drops this connection, and
 * the retry succeeding is the signal that the new server is up.
 */
const reloadScript = `
const ev = new EventSource("/__event/reload");
ev.addEventListener("reload", () => location.reload());
ev.onerror = () => {
	if (ev.readyState === EventSource.CONNECTING) {
		setTimeout(() => location.reload(), 100);
	}
};
`;
