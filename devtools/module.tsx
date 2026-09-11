/**
 * The runtime half of `@bearmetal/devtools`: mounts an in-page inspector
 * overlay, dev-only, into an app's own page.
 *
 * Ships its own independent bundle, built from this package's own
 * `client/overlay.ts` — never added to an app's `components/` directory,
 * since that pipeline has no per-entrypoint dev/prod filter and would ship
 * the panel to production with no way to exclude it.
 *
 * @module
 */

import { bundleEntrypoints, contributeHead } from "@bearmetal/app/ssr";
import { Module, Script, TrustedModule } from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";

/** URL prefix the overlay's bundle is served under. */
export const devtoolsEndpoint = "/@bearmetal/devtools";

/** `Deno.bundle` names an entry's output after its basename — keep in sync with `client/overlay.ts`. */
const entryOutput = "overlay.js";

/** Claims the `/@bearmetal/devtools` namespace, which the router reserves. */
class DevtoolsModule extends TrustedModule {
	constructor() {
		super("@bearmetal/devtools");
	}
}

/**
 * Mounts the devtools overlay: `router.use(devtoolsModule())`.
 *
 * Mirrors `devProxyModule()`/`sockpuppetModule()` — an app opts in explicitly
 * in its own `main.ts`. Never wired into `createStack()`, so `@bearmetal/stack`
 * gains no dependency on this package and an app can add or omit it freely.
 *
 * The `isDev()` check happens here, in the factory, before any `TrustedModule`
 * is even constructed. A `TrustedModule` mounted with zero routes would still
 * print its trust-claim announcement at mount time (`router/trustLog.ts`) —
 * gating inside a route handler would not be enough to keep production quiet.
 */
export function devtoolsModule(): Module {
	if (!isDev()) return new Module();
	return buildDevtoolsModule();
}

function buildDevtoolsModule(): Module {
	const mod = new DevtoolsModule();
	let bundle = new Map<string, string>();

	mod.onStart(async () => {
		const entry = import.meta.resolve("./client/overlay.tsx");
		({ scripts: bundle } = await bundleEntrypoints([entry]));
		contributeHead(() => <script type="module" src={`${devtoolsEndpoint}/${entryOutput}`} />);
	});

	mod.route(`${devtoolsEndpoint}/:file`).get(async (ctx, next) => {
		const script = bundle.get(ctx.params.file as string);
		if (script === undefined) return await next();
		const res = Script(script);
		// Only ever reached when isDev() was true — there is no prod case to cache for.
		res.headers.set("Cache-Control", "no-store");
		return res;
	});

	return mod;
}
