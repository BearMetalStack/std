/**
 * Serving a client written ahead of time by `buildApp`.
 *
 * @module
 */

import { contributeHead, contributeRouteHead } from "../ssr/mod.ts";
import { type Module, Script, Style } from "@bearmetal/router";
import { manifestName, type PrebuiltManifest } from "./build.ts";
import {
	AppModule,
	cache,
	componentHeadTags,
	componentsEndpoint,
	pageDispatchHead,
	type RouteKeys,
	stylesheetName,
} from "./endpoint.tsx";

/**
 * `appModule()` for a prebuilt directory: reads the manifest and every file it
 * names once at startup, then serves them from memory exactly as the bundling
 * variant would.
 */
export function prebuiltApp(dir: URL, register?: () => Promise<unknown>): Module {
	const base = dir.href.endsWith("/") ? dir : new URL(`${dir.href}/`);
	const scripts = new Map<string, string>();
	let styles = "";
	let keys: RouteKeys = { pageKeys: new Set(), componentManifestKeys: new Set() };

	const mod = new AppModule();

	mod.onStart(async () => {
		const manifest = JSON.parse(
			await Deno.readTextFile(new URL(manifestName, base)),
		) as PrebuiltManifest;

		await register?.();

		for (const [name, file] of Object.entries(manifest.scripts)) {
			scripts.set(name, await Deno.readTextFile(new URL(file, base)));
		}
		if (manifest.styles) styles = await Deno.readTextFile(new URL(manifest.styles, base));
		keys = {
			pageKeys: new Set(manifest.pageKeys),
			componentManifestKeys: new Set(manifest.componentManifestKeys),
		};

		contributeHead(() => componentHeadTags(styles, manifest.version, manifest.hasDefault));
		contributeRouteHead(pageDispatchHead(() => keys));
	});

	mod.route(`${componentsEndpoint}/:bundle`)
		.get(async (ctx, next) => {
			const name = ctx.params.bundle as string;
			if (name === stylesheetName) return cache(Style(styles));
			const script = scripts.get(name);
			if (script === undefined) return await next();
			return cache(Script(script));
		});

	return mod;
}
