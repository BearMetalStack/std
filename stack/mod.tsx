/**
 * The runtime half of `@bearmetal/stack`: the module that gets an app's
 * components into the browser.
 *
 * One bundle for the whole app, built from the components directory, served
 * from the reserved `/@bearmetal/components` endpoint and referenced from every
 * page's `<head>`. Both halves of that matter:
 *
 * - **Whole app, not per page.** A bundle assembled from the tags one page
 *   happened to render is missing everything the *next* page needs, which stops
 *   mattering the moment a client-side `<Router>` navigates without a reload.
 * - **Referenced, not inlined.** One file the browser caches once beats the
 *   same bytes pasted into every HTML response, which no cache can reuse.
 *
 * @module
 */

import { bundleEntrypoints, contributeHead, mirrorStripped } from "@bearmetal/app/ssr";
import { getAllStylesheets } from "@bearmetal/app";
import { type Module, Script, Style } from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";
import {
	appJsxImportSource,
	defaultBundleName,
	type Entrypoint,
	findComponentsDir,
	resolveEntrypoints,
	serveMap,
} from "./components.ts";
import { devStack } from "./dev.tsx";
import {
	cache,
	componentHeadTags,
	componentsEndpoint,
	fingerprint,
	StackComponentsModule,
	stylesheetName,
} from "./endpoint.tsx";

export * from "./optimization/fonts/google.tsx";
export type * from "./types.ts";
export { componentDirs, defaultBundleName } from "./components.ts";
export { componentsEndpoint } from "./endpoint.tsx";

/** Loads a component module for its `@define` side effects. */
export type ImportFn = (specifier: string) => Promise<unknown>;

/** How {@linkcode createStack} finds and serves an app's components. */
export interface StackOptions {
	/**
	 * How to import a component module.
	 *
	 * Defaults to a plain dynamic import, which is what you want. Pass
	 * `(s) => import(s)` from the app itself if its components need to resolve
	 * against an import map this package cannot see.
	 */
	import?: ImportFn;
	/**
	 * Where the components live, relative to where the server was started.
	 *
	 * Defaults to `components/`, then `src/components/`.
	 */
	dir?: string;
}

/**
 * Everything an app needs to ship its components to the browser.
 *
 * Mount it above the routes that render pages:
 *
 * ```ts
 * router.use(createStack()).use(page);
 * ```
 *
 * On start it finds the components directory, imports every module in it — so
 * that a tag can be used in a template without the view importing anything —
 * bundles them in one pass, and registers the `<link>` and `<script>` that
 * `Page()` puts in every `<head>`.
 *
 * In dev (`isDev()`), the components are served through `@bearmetal/dev-server`
 * instead of bundled, and a changed component is replaced in the page and on
 * the server without a reload. Pages reference the same URLs either way. Keep
 * the components directory out of `deno run --watch`
 * (`--watch-exclude=components`), or every edit restarts the server first.
 */
export function createStack(options: StackOptions | ImportFn = {}): Module {
	const opts: StackOptions = typeof options === "function" ? { import: options } : options;
	const importModule: ImportFn = opts.import ?? ((specifier) => import(specifier));
	if (isDev()) return devStack(opts.dir, importModule);

	/** Bundles keyed by the name they are served under at the components endpoint. */
	let compBundle: Map<string, string> = new Map();
	let compStyles = "";
	/** Cache buster for the entry URLs; the bundler already content-hashes chunk names. */
	let version = "";

	// Claims the `/@bearmetal/components` namespace, which the router reserves.
	// The class name is what the router reports, so it is declared rather than anonymous.
	const mod = new StackComponentsModule();

	mod.onStart(async () => {
		const dir = await findComponentsDir(opts.dir);
		if (!dir) {
			console.warn(
				"@bearmetal/stack found no components directory (looked for components/ and " +
					"src/components/, relative to where the server was started), so no client bundle " +
					"was built and nothing will hydrate.",
			);
			return;
		}

		// The bundler reads a stripped mirror of the directory, never the real
		// files: emptying `serverInit` in the *output* leaves everything it
		// imported in the bundle, because by then the graph has been walked.
		const stripped = await mirrorStripped(dir, {
			jsxImportSource: await appJsxImportSource(),
		});
		let entrypoints: Entrypoint[] = [];
		let synthesized: string | undefined;

		/** Resolves the entrypoints, imports the components and bundles them. */
		const build = async () => {
			const resolved = await resolveEntrypoints(dir, stripped.root);

			if (synthesized && synthesized !== resolved.tempDir) {
				await Deno.remove(synthesized, { recursive: true }).catch(() => {});
			}
			synthesized = resolved.tempDir;
			entrypoints = resolved.entrypoints;
			if (entrypoints.length === 0) return;

			// Importing the components registers them with the microdom and records
			// their stylesheets, which is what lets a view write `<my-thing />`
			// without importing anything. These are the originals — the server needs
			// the halves the bundle is not allowed to have. Already-imported modules
			// are a no-op, so this only ever picks up new files.
			await Promise.all(resolved.sideEffects.map(importModule));

			const { scripts, styles } = await bundleEntrypoints(entrypoints.map((e) => e.path));
			compBundle = serveMap(entrypoints, scripts);
			// Component stylesheets come from the server-side registry rather than
			// the bundle, because the bundler strips them on the way out — they are
			// wanted in the first paint, not after the module that declares them has
			// loaded.
			compStyles = [getAllStylesheets(), styles].filter(Boolean).join("\n");
			version = await fingerprint(compBundle.get(defaultBundleName) ?? "", compStyles);
		};

		await build();

		if (entrypoints.length === 0) {
			console.warn(`@bearmetal/stack found no components in ${dir}/, so no bundle was built.`);
			await stripped.dispose();
			return;
		}

		contributeHead(() =>
			componentHeadTags(
				compStyles,
				version,
				entrypoints.some((e) => e.served === defaultBundleName),
			)
		);

		// Nothing rebuilds in production, so neither copy is needed again.
		await stripped.dispose();
		if (synthesized) await Deno.remove(synthesized, { recursive: true }).catch(() => {});
	});

	mod.route(`${componentsEndpoint}/:bundle`)
		.get(async (ctx, next) => {
			const name = ctx.params.bundle as string;
			if (name === stylesheetName) return cache(Style(compStyles));
			const script = compBundle.get(name);
			if (script === undefined) return await next();
			return cache(Script(script));
		});

	return mod;
}
