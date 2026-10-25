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
import { type Module, Script, Style } from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";
import {
	appJsxImportSource,
	defaultBundleName,
	findAppDir,
	findComponentsDir,
	findPagesDir,
	localImportAliases,
	type Resolved,
	resolveEntrypoints,
	serveMap,
} from "./discovery.ts";
import {
	AppModule,
	cache,
	componentHeadTags,
	componentsEndpoint,
	fingerprint,
	type ImportFn,
	pageDispatchHead,
	stylesheetName,
} from "./endpoint.tsx";
import { prebuiltApp } from "./prebuilt.tsx";
import { devApp, type DevServerFactory } from "./dev.tsx";

export * from "./discovery.ts";
export * from "./routeResolution.ts";
export { componentsEndpoint, type ImportFn, type RouteKeys } from "./endpoint.tsx";
export type { PrebuiltManifest } from "./build.ts";
export type { DevServerFactory, DevServerHook, DevServerHookOptions } from "./dev.tsx";

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
	/**
	 * A directory written by `buildApp` from `@bearmetal/app/build`.
	 *
	 * Outside dev, the module serves that instead of bundling at startup, and
	 * never looks for `@components`/`@app`/`@pages` — which is what lets an app
	 * run from a `deno compile` binary. Embed it with `--include`, and pass a
	 * `file:` URL built from `import.meta.url` so it resolves inside the binary.
	 */
	prebuilt?: URL;
	/**
	 * Imports the components server-side when serving a prebuilt client.
	 *
	 * Pass `() => import("./dist/client/server.ts")` — a literal specifier, so
	 * `deno compile` sees the import and embeds every component with it.
	 */
	register?: () => Promise<unknown>;
	/**
	 * The dev server to serve the client through in dev, unbundled.
	 *
	 * Pass `appDevServer` from `@bearmetal/dev-server`. A changed component is
	 * then replaced in the page and on the server without a reload. Without
	 * one, dev rebuilds the bundle on a change and reloads the page. Keep the
	 * components directory out of `deno run --watch`
	 * (`--watch-exclude=components`) either way, or every edit restarts the
	 * server first.
	 */
	devServer?: DevServerFactory;
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
 *
 * In dev, `devServer` serves everything unbundled with hot replacement.
 * Outside dev, `prebuilt` serves a client built ahead of time instead.
 */
export function appModule(options: AppModuleOptions | ImportFn = {}): Module {
	const opts: AppModuleOptions = typeof options === "function" ? { import: options } : options;
	const importModule: ImportFn = opts.import ?? ((specifier) => import(specifier));
	if (isDev() && opts.devServer) return devApp(opts, importModule, opts.devServer);
	if (!isDev() && opts.prebuilt) return prebuiltApp(opts.prebuilt, opts.register);

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
			resolved = await resolveEntrypoints(componentsDir, appDir, pagesDir, {
				mirrors: { components: stripped?.root },
			});

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

		contributeHead(() => [
			...componentHeadTags(
				compStyles,
				version,
				resolved.entrypoints.some((e) => e.served === defaultBundleName),
			),
			...(isDev() ? [<script $raw>{reloadScript}</script>] : []),
		]);
		contributeRouteHead(pageDispatchHead(() => resolved));

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
