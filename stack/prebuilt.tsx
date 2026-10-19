/**
 * Serving a bundle written ahead of time by `buildStack`.
 *
 * @module
 */

import { contributeHead } from "@bearmetal/app/ssr";
import { type Module, Script, Style } from "@bearmetal/router";
import { manifestName, type PrebuiltManifest } from "./build.ts";
import {
	cache,
	componentHeadTags,
	componentsEndpoint,
	StackComponentsModule,
	stylesheetName,
} from "./endpoint.tsx";

/**
 * The production stack for a prebuilt directory: reads the manifest and every
 * file it names once at startup, then serves them from memory exactly as the
 * bundling stack would.
 */
export function prebuiltStack(dir: URL, register?: () => Promise<unknown>): Module {
	const base = dir.href.endsWith("/") ? dir : new URL(`${dir.href}/`);
	const scripts = new Map<string, string>();
	let styles = "";

	const mod = new StackComponentsModule();

	mod.onStart(async () => {
		const manifest = JSON.parse(
			await Deno.readTextFile(new URL(manifestName, base)),
		) as PrebuiltManifest;

		await register?.();

		for (const [name, file] of Object.entries(manifest.scripts)) {
			scripts.set(name, await Deno.readTextFile(new URL(file, base)));
		}
		if (manifest.styles) styles = await Deno.readTextFile(new URL(manifest.styles, base));

		contributeHead(() => componentHeadTags(styles, manifest.version, manifest.hasDefault));
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
