/**
 * `appModule()` in dev, with a dev server plugged in: nothing is bundled, and
 * a changed component is replaced in the page instead of reloading it.
 *
 * `@bearmetal/app` does not depend on a dev server — the dev server depends on
 * it, for `contributeHead()` — so one is handed in as a
 * {@linkcode DevServerFactory}. `@bearmetal/dev-server` exports one as
 * `appDevServer`.
 *
 * What a page references does not change. `/@bearmetal/components/index`
 * answers with a one-line module importing the entry from the dev server, and
 * the stylesheet link is the same.
 *
 * @module
 */

import {
	contributeHead,
	contributeRouteHead,
	mirrorStripped,
	type StrippedTree,
	stripServerCode,
} from "../ssr/mod.ts";
import { getAllStylesheets } from "../define.ts";
import { enableHotReplacement } from "../hmr.ts";
import { joinPath } from "@bearmetal/miscellanea";
import { type Module, Router, Script, Style } from "@bearmetal/router";
import {
	appJsxImportSource,
	defaultBundleName,
	findAppDir,
	findComponentsDir,
	findPagesDir,
	localImportAliases,
	type Resolved,
	resolveEntrypoints,
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

/** What `appModule()` hands a dev server: one directory, served as separate modules. */
export interface DevServerHookOptions {
	/** The directory to serve and watch. Resolves once `appModule()` has staged it. */
	root: () => Promise<string>;
	/** Entry modules, relative to `root`. Re-read whenever the page is about to reload. */
	entry: () => string[];
	/** Applied to every module and vendor file before it is served. */
	transform: (code: string) => string;
}

/** A dev server, as `appModule()` mounts it. */
export interface DevServerHook {
	/** Mounted after `appModule()`'s own module. Must register no catch-all route. */
	module: Module;
	/** The URL the browser imports `path`, relative to `root`, from. */
	sourceUrl(path: string): string;
}

/** Builds a dev server for `appModule()`. `@bearmetal/dev-server` exports one as `appDevServer`. */
export type DevServerFactory = (options: DevServerHookOptions) => DevServerHook;

/** Where `devApp` looks, before falling back to the default directories. */
export interface DevAppDirs {
	componentsDir?: string;
	appDir?: string;
	pagesDir?: string;
}

const SETTLE_MS = 50;

/**
 * Only `serverInit` is stripped in dev. A component's `stylesheet` has to reach
 * the browser for a change to it to be swapped in; it is CSS, not a secret.
 */
const DEV_SERVER_ONLY = ["serverInit"];

/**
 * Builds the dev variant of `appModule()`.
 *
 * `@components`, `@app` and `@pages` are each mirrored, stripped, into one
 * staging directory, side by side, and the dev server serves that and nothing
 * else — so an import between them lands on the stripped copy, and a shared
 * store loads once. `stripServerCode` still runs over every module on the way
 * out, as it does over the bundle. On the server, hot replacement is enabled
 * before any component is imported, and a changed component is re-imported,
 * so server renders use the new class as well.
 */
export function devApp(
	dirs: DevAppDirs,
	importModule: ImportFn,
	factory: DevServerFactory,
): Module {
	enableHotReplacement();

	const staging = Deno.makeTempDir({ prefix: "bearmetal-dev-" });
	let root: string | undefined;
	let resolved: Resolved = {
		entrypoints: [],
		sideEffects: [],
		componentManifestKeys: new Set(),
		pageKeys: new Set(),
	};
	let styles = "";
	let version = "";
	const imported = new Set<string>();
	const relative = (path: string) => path.slice(root!.length + 1);

	const mod = new AppModule();

	mod.onStart(async () => {
		const found = {
			components: await findComponentsDir(dirs.componentsDir),
			app: await findAppDir(dirs.appDir),
			pages: await findPagesDir(dirs.pagesDir),
		};
		if (!found.components && !found.app && !found.pages) {
			console.warn(
				"@bearmetal/app found no components/, app/, or pages/ directory (looked relative " +
					"to where the server was started), so nothing will hydrate.",
			);
			return;
		}

		const stage = await staging;
		const copies: Record<string, string> = {};
		for (const [name, dir] of Object.entries(found)) {
			if (dir) copies[dir] = joinPath(stage, name);
		}
		const jsxImportSource = await appJsxImportSource();
		const imports = await localImportAliases();
		const trees: StrippedTree[] = [];
		for (const [dir, target] of Object.entries(copies)) {
			const siblings = Object.fromEntries(Object.entries(copies).filter(([d]) => d !== dir));
			trees.push(
				await mirrorStripped(dir, {
					target,
					siblings,
					names: DEV_SERVER_ONLY,
					jsxImportSource,
					imports,
				}),
			);
		}
		root = stage;

		const resolve = async () => {
			resolved = await resolveEntrypoints(found.components, found.app, found.pages, {
				mirrors: {
					components: found.components && copies[found.components],
					app: found.app && copies[found.app],
					pages: found.pages && copies[found.pages],
				},
				synthesizeIn: stage,
			});
			for (const url of resolved.sideEffects) {
				if (imported.has(url)) continue;
				imported.add(url);
				await importModule(url);
			}
			styles = getAllStylesheets();
			version = await fingerprint(styles);
		};
		await resolve();

		if (resolved.entrypoints.length === 0) {
			console.warn("@bearmetal/app found nothing to serve in components/, app/, or pages/.");
		}
		contributeHead(() =>
			componentHeadTags(
				styles,
				version,
				resolved.entrypoints.some((e) => e.served === defaultBundleName),
			)
		);
		contributeRouteHead(pageDispatchHead(() => resolved));

		const changed = async (paths: string[]) => {
			for (const tree of trees) await tree.refresh();
			for (const path of paths) {
				const url = await Deno.realPath(path).then((p) => `file://${p}`, () => null);
				if (!url || !imported.has(url)) continue;
				try {
					await importModule(`${url}?t=${Date.now()}`);
				} catch (e) {
					console.error(`@bearmetal/app could not re-import ${path}:`, e);
				}
			}
			await resolve();
		};
		watch(Object.keys(copies), changed).catch((e) =>
			console.error("@bearmetal/app stopped watching for changes:", e)
		);
	});

	mod.route(`${componentsEndpoint}/:bundle`).get(async (ctx, next) => {
		const name = ctx.params.bundle as string;
		if (name === stylesheetName) return cache(Style(styles));
		const entry = resolved.entrypoints.find((e) => e.served === name);
		if (!entry || !root) return await next();
		const src = dev.sourceUrl(relative(entry.path));
		return cache(Script(`import ${JSON.stringify(src)};\n`));
	});

	const dev = factory({
		root: () => staging,
		entry: () => root ? resolved.entrypoints.map((e) => relative(e.path)) : [],
		transform: (code) => stripServerCode(code, { names: DEV_SERVER_ONLY }),
	});

	return new Router().use(mod).use(dev.module);
}

/** Calls `changed` with each settled batch of paths that changed under `dirs`. */
async function watch(dirs: string[], changed: (paths: string[]) => Promise<void>): Promise<void> {
	const pending = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running = Promise.resolve();
	for await (const event of Deno.watchFs(dirs, { recursive: true })) {
		if (event.kind === "access" || event.kind === "other") continue;
		event.paths.forEach((p) => pending.add(p));
		clearTimeout(timer);
		timer = setTimeout(() => {
			const batch = [...pending];
			pending.clear();
			running = running.then(() => changed(batch)).catch((e) =>
				console.error("@bearmetal/app failed to pick up a change:", e)
			);
		}, SETTLE_MS);
	}
}
