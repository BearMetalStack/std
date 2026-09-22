/**
 * `createStack()` in dev: the components are served through
 * `@bearmetal/dev-server` rather than bundled, so a change to one is replaced
 * in the page instead of reloading it.
 *
 * What a page references does not change. `/@bearmetal/components/index` and
 * each subset still answer, with a one-line module importing the entry from
 * the dev server, and the stylesheet link is the same.
 *
 * @module
 */

import {
	contributeHead,
	mirrorStripped,
	type StrippedTree,
	stripServerCode,
} from "@bearmetal/app/ssr";
import { enableHotReplacement, getAllStylesheets } from "@bearmetal/app";
import { devServerModule, devServerSourceUrl } from "@bearmetal/dev-server";
import { type Module, Router, Script, Style } from "@bearmetal/router";
import {
	appJsxImportSource,
	defaultBundleName,
	type Entrypoint,
	findComponentsDir,
	resolveEntrypoints,
} from "./components.ts";
import {
	cache,
	componentHeadTags,
	componentsEndpoint,
	fingerprint,
	StackComponentsModule,
	stylesheetName,
} from "./endpoint.tsx";
import type { ImportFn } from "./mod.tsx";

const SETTLE_MS = 50;

/**
 * Only `serverInit` is stripped in dev. A component's `stylesheet` has to reach
 * the browser for a change to it to be swapped in; it is CSS, not a secret.
 */
const DEV_SERVER_ONLY = ["serverInit"];

/**
 * Builds the dev variant of the components module.
 *
 * The dev server serves the stripped mirror and nothing else — the same copy
 * the production bundler reads — and runs `stripServerCode` over every module
 * and vendor file on the way out, as the bundle does. On the server, hot
 * replacement is enabled before any component is imported, and a changed
 * component is re-imported, so server renders use the new class as well.
 */
export function devStack(dir: string | undefined, importModule: ImportFn): Module {
	enableHotReplacement();

	let stripped: StrippedTree | undefined;
	let entrypoints: Entrypoint[] = [];
	let styles = "";
	let version = "";
	const imported = new Set<string>();

	const mod = new StackComponentsModule();

	mod.onStart(async () => {
		const found = await findComponentsDir(dir);
		if (!found) {
			console.warn(
				"@bearmetal/stack found no components directory (looked for components/ and " +
					"src/components/, relative to where the server was started), so nothing will hydrate.",
			);
			return;
		}
		stripped = await mirrorStripped(found, {
			jsxImportSource: await appJsxImportSource(),
			names: DEV_SERVER_ONLY,
		});
		const tree = stripped;

		const resolve = async () => {
			const resolved = await resolveEntrypoints(found, tree.root, { synthesizeInBundleDir: true });
			entrypoints = resolved.entrypoints;
			for (const url of resolved.sideEffects) {
				if (imported.has(url)) continue;
				imported.add(url);
				await importModule(url);
			}
			styles = getAllStylesheets();
			version = await fingerprint(styles);
		};
		await resolve();

		if (entrypoints.length === 0) {
			console.warn(`@bearmetal/stack found no components in ${found}/.`);
		}
		contributeHead(() =>
			componentHeadTags(
				styles,
				version,
				entrypoints.some((e) => e.served === defaultBundleName),
			)
		);

		const changed = async (paths: string[]) => {
			await tree.refresh();
			for (const path of paths) {
				const url = await Deno.realPath(path).then((p) => `file://${p}`, () => null);
				if (!url || !imported.has(url)) continue;
				try {
					await importModule(`${url}?t=${Date.now()}`);
				} catch (e) {
					console.error(`@bearmetal/stack could not re-import ${path}:`, e);
				}
			}
			await resolve();
		};
		watch(found, changed).catch((e) =>
			console.error("stopped watching the components directory:", e)
		);
	});

	mod.route(`${componentsEndpoint}/:bundle`).get(async (ctx, next) => {
		const name = ctx.params.bundle as string;
		if (name === stylesheetName) return cache(Style(styles));
		const entry = entrypoints.find((e) => e.served === name);
		if (!entry || !stripped) return await next();
		const src = devServerSourceUrl(entry.path.slice(stripped.root.length + 1));
		return cache(Script(`import ${JSON.stringify(src)};\n`));
	});

	const dev = devServerModule({
		root: () => stripped?.root ?? Deno.makeTempDir({ prefix: "bearmetal-empty-" }),
		entry: () => stripped ? entrypoints.map((e) => e.path.slice(stripped!.root.length + 1)) : [],
		injectEntry: false,
		mount: false,
		transform: (code) => stripServerCode(code, { names: DEV_SERVER_ONLY }),
	});

	return new Router().use(mod).use(dev);
}

/** Calls `changed` with each settled batch of paths that changed under `dir`. */
async function watch(dir: string, changed: (paths: string[]) => Promise<void>): Promise<void> {
	const pending = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running = Promise.resolve();
	for await (const event of Deno.watchFs(dir, { recursive: true })) {
		if (event.kind === "access" || event.kind === "other") continue;
		event.paths.forEach((p) => pending.add(p));
		clearTimeout(timer);
		timer = setTimeout(() => {
			const batch = [...pending];
			pending.clear();
			running = running.then(() => changed(batch)).catch((e) =>
				console.error("@bearmetal/stack failed to pick up a change:", e)
			);
		}, SETTLE_MS);
	}
}
