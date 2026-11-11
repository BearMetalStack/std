/**
 * Serving a client build, however it was produced.
 *
 * `appModule()`'s prebuilt variant, and hosts that bundle the client their own
 * way, all end up holding the same thing: script text by served name, the
 * component CSS, a cache-busting version, and the route keys for page
 * dispatch. {@linkcode clientModule} serves that and contributes the head tags
 * every page needs to load it, so producers only have to build it.
 *
 * @module
 */

import { contributeHead, contributeRouteHead } from "../ssr/mod.ts";
import { type Module, Script, Style } from "@bearmetal/router";
import {
	AppModule,
	cache,
	componentHeadTags,
	componentsEndpoint,
	pageDispatchHead,
	stylesheetName,
} from "./endpoint.tsx";

/** A client build: everything {@linkcode clientModule} serves. */
export interface ClientBuild {
	/** Script text keyed by the name it is served under (the default bundle and its chunks). */
	scripts: ReadonlyMap<string, string>;
	/** Every component's CSS, or `""` when there is none. */
	styles: string;
	/** Cache buster appended to the bundle and stylesheet URLs. */
	version: string;
	/** Whether there is a default bundle to reference from every page. */
	hasDefault: boolean;
	/** Candidate keys discovered under `@pages`, for per-route dispatch. */
	pageKeys: ReadonlySet<string>;
	/** Candidate keys with a `@components` manifest, for the dev-only diagnostic. */
	componentManifestKeys: ReadonlySet<string>;
}

/**
 * Serves a client build at the reserved `/@bearmetal/components` endpoint and
 * references it from every page's `<head>`.
 *
 * `load` runs once, at startup. Returning `null` means there is no client:
 * nothing is served and no tags are added.
 */
export function clientModule(load: () => Promise<ClientBuild | null>): Module {
	let build: ClientBuild | null = null;

	const mod = new AppModule();

	mod.onStart(async () => {
		build = await load();
		if (!build) return;
		const current = build;
		contributeHead(() => componentHeadTags(current.styles, current.version, current.hasDefault));
		contributeRouteHead(pageDispatchHead(() => current));
	});

	mod.route(`${componentsEndpoint}/:bundle`)
		.get(async (ctx, next) => {
			if (!build) return await next();
			const name = ctx.params.bundle as string;
			if (name === stylesheetName) return cache(Style(build.styles));
			const script = build.scripts.get(name);
			if (script === undefined) return await next();
			return cache(Script(script));
		});

	return mod;
}
