/**
 * @module
 * Static output: the site written to a directory through `@bearmetal/diecast`.
 *
 * Every page is a literal route, so diecast enumerates the site from the router alone — there is
 * no manifest. The stylesheet, client, icons and logos are copied explicitly (an icon referenced
 * only by `<use href>` is invisible to asset discovery), and the 404 page is written as `404.html`
 * for static hosts.
 */

import { join } from "@std/path";
import { Router } from "@bearmetal/router";
import { diecast } from "@bearmetal/diecast";
import type { GenerationReport } from "@bearmetal/diecast/types";
import type { Diagnostic } from "./types.ts";
import { ASSET_FILES, gutenbeargModule, type GutenbeargOptions } from "./module.tsx";
import { ASSET_BASE } from "./templates/assets.ts";

/** Options for {@linkcode build}. */
export interface BuildOptions extends Omit<GutenbeargOptions, "watch"> {
	/** Where to write the site. Defaults to `dist`. */
	outDir?: string;
	/** Refuse to build when loading reported any diagnostic. */
	strict?: boolean;
}

/** What {@linkcode build} did. */
export interface BuildResult {
	report: GenerationReport;
	diagnostics: Diagnostic[];
	/** False when the build was refused (strict, with diagnostics) or diecast failed. */
	ok: boolean;
}

/** Renders the whole site into `outDir`. */
export async function build(options: BuildOptions = {}): Promise<BuildResult> {
	const outDir = options.outDir ?? "dist";
	const module = await gutenbeargModule({ ...options, watch: false });
	const diagnostics = module.content.diagnostics;
	const router = new Router().use(module);
	if (options.strict && diagnostics.length) {
		return { report: emptyReport(), diagnostics, ok: false };
	}

	const report = await diecast(router, { outDir });

	const fetch = (path: string) =>
		router.handler(
			new Request(`http://localhost${path}`),
			{} as unknown as Deno.ServeHandlerInfo<Deno.Addr>,
		);
	for (const file of ASSET_FILES) {
		const res = await fetch(`${ASSET_BASE}/${file}`);
		const target = join(outDir, ASSET_BASE.slice(1), file);
		await Deno.mkdir(join(outDir, ASSET_BASE.slice(1)), { recursive: true });
		await Deno.writeFile(target, new Uint8Array(await res.arrayBuffer()));
	}
	const missing = await fetch(`${options.base ?? ""}/__gutenbearg_404__`);
	await Deno.writeTextFile(join(outDir, "404.html"), await missing.text());

	return { report, diagnostics, ok: report.ok };
}

function emptyReport(): GenerationReport {
	return {
		pages: [],
		failures: [],
		problems: [],
		copiedDirs: [],
		duration: 0,
		get ok() {
			return false;
		},
	};
}
