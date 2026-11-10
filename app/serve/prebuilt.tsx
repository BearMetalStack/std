/**
 * Serving a client written ahead of time by `buildApp`.
 *
 * @module
 */

import type { Module } from "@bearmetal/router";
import { manifestName, type PrebuiltManifest } from "./build.ts";
import { clientModule } from "./client.tsx";

/**
 * `appModule()` for a prebuilt directory: reads the manifest and every file it
 * names once at startup, then serves them from memory exactly as the bundling
 * variant would.
 */
export function prebuiltApp(dir: URL, register?: () => Promise<unknown>): Module {
	const base = dir.href.endsWith("/") ? dir : new URL(`${dir.href}/`);

	return clientModule(async () => {
		const manifest = JSON.parse(
			await Deno.readTextFile(new URL(manifestName, base)),
		) as PrebuiltManifest;

		await register?.();

		const scripts = new Map<string, string>();
		for (const [name, file] of Object.entries(manifest.scripts)) {
			scripts.set(name, await Deno.readTextFile(new URL(file, base)));
		}
		return {
			scripts,
			styles: manifest.styles ? await Deno.readTextFile(new URL(manifest.styles, base)) : "",
			version: manifest.version,
			hasDefault: manifest.hasDefault,
			pageKeys: new Set(manifest.pageKeys),
			componentManifestKeys: new Set(manifest.componentManifestKeys),
		};
	});
}
