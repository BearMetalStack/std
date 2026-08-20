/**
 * Building the client bundle.
 *
 * One pass, code splitting on, over every entrypoint an app ships. Deliberately
 * not per page: a page's bundle would be missing every component the *next*
 * page needs, which is fine until a client-side `<Router>` navigates to it and
 * finds nothing to upgrade with. Whoever calls this decides what the
 * entrypoints are — `@bearmetal/stack` uses the components directory.
 *
 * @module
 */

import { isDev } from "@bearmetal/miscellanea/environment";
import { stripServerCode } from "./stripServer.ts";

/** Emitted files from a bundle: script text keyed by output filename, plus concatenated CSS. */
export type BundleOutput = {
	/** Script text keyed by the filename the bundler emitted it under. */
	scripts: Map<string, string>;
	/** Every emitted stylesheet, concatenated. */
	styles: string;
};

/**
 * Members that exist only to serve a render, and must not reach a browser.
 *
 * `serverInit` is the one that matters: it is where a component's queries and
 * file reads live, and shipping it would drag that entire dependency tree into
 * the client bundle. `stylesheet` is served as CSS alongside the bundle, so a
 * second copy inside it is dead weight that also arrives too late to help.
 */
const serverOnlyNames = ["serverInit", "stylesheet"];

/**
 * Bundles a set of entrypoints in a single pass, with code splitting on.
 *
 * Anything shared by two or more entrypoints — including the `@bearmetal/app`
 * runtime and its signals, which every component pulls in — is hoisted into a
 * `chunk-*.js` output that each entry imports by relative path. Serve every
 * output from the same URL directory and those relative imports resolve.
 *
 * Entry outputs are named after their entrypoint's basename, so callers can map
 * an output back to the entrypoint that produced it.
 */
export async function bundleEntrypoints(entrypoints: string[]): Promise<BundleOutput> {
	const scripts = new Map<string, string>();
	if (entrypoints.length === 0) return { scripts, styles: "" };

	const bundle = await Deno.bundle({
		entrypoints,
		write: false,
		codeSplitting: true,
		platform: "browser",
		outputDir: "scripts",
		minify: !isDev(),
		sourcemap: isDev() ? "inline" : undefined,
	});

	let styles = "";
	for (const file of bundle.outputFiles ?? []) {
		const name = file.path.split("/").pop()!;
		if (name.endsWith(".css")) {
			styles += file.text();
			continue;
		}
		scripts.set(name, stripServerCode(file.text(), { names: serverOnlyNames }));
	}

	return { scripts, styles };
}
