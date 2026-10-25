/**
 * Building an app's client ahead of time, for `deno compile`.
 *
 * A compiled binary carries no bundler, and its working directory is wherever
 * it happens to be run from, so the production half of `appModule()` — find
 * `@components`/`@app`/`@pages`, bundle them at startup — cannot work inside
 * one. This moves that work to build time: {@linkcode buildApp} writes the
 * bundle, the component CSS and a manifest to a directory the binary embeds
 * with `--include`, plus a `server.ts` that imports every component, which the
 * app hands to `appModule({ prebuilt, register })` so the server-side halves
 * are embedded too.
 *
 * ```ts
 * // scripts/build.ts
 * await buildApp({ outDir: "dist/client" });
 *
 * // main.ts
 * router.use(appModule({
 *   prebuilt: new URL("./dist/client/", import.meta.url),
 *   register: () => import("./dist/client/server.ts"),
 * }));
 * ```
 *
 * @module
 */

import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntrypoints, mirrorStripped } from "../ssr/mod.ts";
import { getAllStylesheets } from "../define.ts";
import { joinPath } from "@bearmetal/miscellanea";
import {
	appJsxImportSource,
	defaultBundleName,
	findAppDir,
	findComponentsDir,
	findPagesDir,
	localImportAliases,
	resolveEntrypoints,
	serveMap,
} from "./discovery.ts";
import { fingerprint, type ImportFn, stylesheetName } from "./endpoint.tsx";

/** What {@linkcode buildApp} writes next to the bundle, and `appModule()` reads back. */
export type PrebuiltManifest = {
	/** Cache buster for the entry URL. */
	version: string;
	/** Whether there is a default bundle to reference from every page. */
	hasDefault: boolean;
	/** Served name → file in the output directory. */
	scripts: Record<string, string>;
	/** File holding every component's CSS, or `null` when there is none. */
	styles: string | null;
	/** Candidate keys discovered under `@pages`, for per-route dispatch. */
	pageKeys: string[];
	/** Candidate keys with a `@components` manifest, for the dev-only diagnostic. */
	componentManifestKeys: string[];
};

/** Name of the manifest inside a prebuilt directory. */
export const manifestName = "manifest.json";

/** Name of the generated module that imports every component server-side. */
export const serverEntryName = "server.ts";

/** Options for {@linkcode buildApp}. */
export type BuildAppOptions = {
	/** Where the components live. Defaults to `components/`, then `src/components/`. */
	componentsDir?: string;
	/** Where shared modules live. Defaults to `app/`, then `src/app/`. */
	appDir?: string;
	/** Where per-route orchestration lives. Defaults to `pages/`, then `src/pages/`. */
	pagesDir?: string;
	/** Where to write the output. Emptied first. Defaults to `dist/client`. */
	outDir?: string;
	/** How to import a component module. Defaults to a plain dynamic import. */
	import?: ImportFn;
	/** Minify the bundle. Defaults to `true`. */
	minify?: boolean;
};

/**
 * Bundles `@components`/`@app`/`@pages` into `outDir` for a prebuilt
 * `appModule()`.
 *
 * Returns the manifest it wrote, or `null` when there was nothing to bundle.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<PrebuiltManifest | null> {
	const importModule: ImportFn = options.import ?? ((specifier) => import(specifier));
	const outDir = options.outDir ?? "dist/client";
	const componentsDir = await findComponentsDir(options.componentsDir);
	const appDir = await findAppDir(options.appDir);
	const pagesDir = await findPagesDir(options.pagesDir);
	if (!componentsDir && !appDir && !pagesDir) {
		console.warn("@bearmetal/app found no components/, app/, or pages/ directory to build.");
		return null;
	}

	const stripped = componentsDir
		? await mirrorStripped(componentsDir, {
			jsxImportSource: await appJsxImportSource(),
			imports: await localImportAliases(),
		})
		: undefined;
	const resolved = await resolveEntrypoints(componentsDir, appDir, pagesDir, {
		mirrors: { components: stripped?.root },
	});
	try {
		if (resolved.entrypoints.length === 0) return null;

		await Promise.all(resolved.sideEffects.map(importModule));
		const { scripts, styles } = await bundleEntrypoints(
			resolved.entrypoints.map((e) => e.path),
			{ minify: options.minify ?? true, sourcemap: false },
		);
		const served = serveMap(resolved.entrypoints, scripts);
		const css = [getAllStylesheets(), styles].filter(Boolean).join("\n");

		await Deno.remove(outDir, { recursive: true }).catch(() => {});
		await Deno.mkdir(outDir, { recursive: true });

		const manifest: PrebuiltManifest = {
			version: await fingerprint(served.get(defaultBundleName) ?? "", css),
			hasDefault: resolved.entrypoints.some((e) => e.served === defaultBundleName),
			scripts: {},
			styles: css ? stylesheetName : null,
			pageKeys: [...resolved.pageKeys],
			componentManifestKeys: [...resolved.componentManifestKeys],
		};
		for (const [name, code] of served) {
			const file = name.endsWith(".js") ? name : `${name}.js`;
			manifest.scripts[name] = file;
			await Deno.writeTextFile(joinPath(outDir, file), code);
		}
		if (css) await Deno.writeTextFile(joinPath(outDir, stylesheetName), css);
		await Deno.writeTextFile(joinPath(outDir, manifestName), JSON.stringify(manifest, null, "\t"));
		await Deno.writeTextFile(
			joinPath(outDir, serverEntryName),
			serverEntry(await Deno.realPath(outDir), resolved.sideEffects),
		);
		return manifest;
	} finally {
		await stripped?.dispose();
		if (resolved.tempDir) await Deno.remove(resolved.tempDir, { recursive: true }).catch(() => {});
	}
}

/**
 * A module that imports every real component file, relative to `outDir`, so
 * that `deno compile` follows the imports and embeds them.
 */
function serverEntry(outDir: string, sideEffects: string[]): string {
	const lines = [
		"// Generated by @bearmetal/app/build. Do not edit.",
		"// Imports every component so the server registers them and `deno compile` embeds them.",
	];
	for (const url of sideEffects) {
		let spec = relative(outDir, fileURLToPath(url)).replaceAll("\\", "/");
		if (!spec.startsWith(".")) spec = `./${spec}`;
		lines.push(`import ${JSON.stringify(spec)};`);
	}
	return lines.join("\n") + "\n";
}
