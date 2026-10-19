/**
 * Building an app's components ahead of time, for `deno compile`.
 *
 * A compiled binary carries no bundler, and its working directory is wherever
 * it happens to be run from, so the production half of {@linkcode createStack}
 * — find `components/`, bundle it at startup — cannot work inside one. This
 * moves that work to build time: {@linkcode buildStack} writes the bundle, the
 * component CSS and a manifest to a directory the binary embeds with
 * `--include`, plus a `server.ts` that imports every component, which the app
 * hands to `createStack({ prebuilt, register })` so the server-side halves are
 * embedded too.
 *
 * ```ts
 * // scripts/build.ts
 * await buildStack({ outDir: "dist/components" });
 *
 * // main.ts
 * router.use(createStack({
 *   prebuilt: new URL("./dist/components/", import.meta.url),
 *   register: () => import("./dist/components/server.ts"),
 * }));
 * ```
 *
 * @module
 */

import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntrypoints, mirrorStripped } from "@bearmetal/app/ssr";
import { getAllStylesheets } from "@bearmetal/app";
import { joinPath } from "@bearmetal/miscellanea";
import {
	appJsxImportSource,
	defaultBundleName,
	findComponentsDir,
	resolveEntrypoints,
	serveMap,
} from "./components.ts";
import { fingerprint, stylesheetName } from "./endpoint.tsx";
import type { ImportFn } from "./mod.tsx";

/** What {@linkcode buildStack} writes next to the bundle, and `createStack` reads back. */
export type PrebuiltManifest = {
	/** Cache buster for the entry URLs. */
	version: string;
	/** Whether there is a default bundle to reference from every page. */
	hasDefault: boolean;
	/** Served name → file in the output directory. */
	scripts: Record<string, string>;
	/** File holding every component's CSS, or `null` when there is none. */
	styles: string | null;
};

/** Name of the manifest inside a prebuilt directory. */
export const manifestName = "manifest.json";

/** Name of the generated module that imports every component server-side. */
export const serverEntryName = "server.ts";

/** Options for {@linkcode buildStack}. */
export type BuildStackOptions = {
	/** The components directory. Defaults to `components/`, then `src/components/`. */
	dir?: string;
	/** Where to write the output. Emptied first. Defaults to `dist/components`. */
	outDir?: string;
	/** How to import a component module. Defaults to a plain dynamic import. */
	import?: ImportFn;
	/** Minify the bundle. Defaults to `true`. */
	minify?: boolean;
};

/**
 * Bundles the components directory into `outDir` for a prebuilt stack.
 *
 * Returns the manifest it wrote, or `null` when there were no components.
 */
export async function buildStack(
	options: BuildStackOptions = {},
): Promise<PrebuiltManifest | null> {
	const importModule: ImportFn = options.import ?? ((specifier) => import(specifier));
	const outDir = options.outDir ?? "dist/components";
	const dir = await findComponentsDir(options.dir);
	if (!dir) {
		console.warn("@bearmetal/stack found no components directory, so nothing was built.");
		return null;
	}

	const stripped = await mirrorStripped(dir, { jsxImportSource: await appJsxImportSource() });
	const resolved = await resolveEntrypoints(dir, stripped.root);
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
		await stripped.dispose();
		if (resolved.tempDir) await Deno.remove(resolved.tempDir, { recursive: true }).catch(() => {});
	}
}

/**
 * A module that imports every real component file, relative to `outDir`, so
 * that `deno compile` follows the imports and embeds them. Synthesized entries
 * live in a temp directory and only re-import the same components, so they are
 * left out.
 */
function serverEntry(outDir: string, sideEffects: string[]): string {
	const lines = [
		"// Generated by @bearmetal/stack/build. Do not edit.",
		"// Imports every component so the server registers them and `deno compile` embeds them.",
	];
	for (const url of sideEffects) {
		const path = fileURLToPath(url);
		if (path.includes("bearmetal-components.ts")) continue;
		let spec = relative(outDir, path).replaceAll("\\", "/");
		if (!spec.startsWith(".")) spec = `./${spec}`;
		lines.push(`import ${JSON.stringify(spec)};`);
	}
	return lines.join("\n") + "\n";
}
