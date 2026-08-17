/**
 * @module
 * The command line, as a function your project calls.
 *
 * Diecast ships no global binary on purpose. A binary would have to reach your
 * app by dynamic import, and would then resolve it against *diecast's* import
 * map rather than yours - every bare specifier in your code, `@bearmetal/router`
 * and your own aliases alike, would fail to resolve. JSR also wants a statically
 * analyzable module graph, which a computed import is not.
 *
 * So the entry point is inverted: your module is the process entry, and it
 * imports diecast rather than the other way round. Everything resolves against
 * your own `deno.json`.
 */

import { colorize } from "@bearmetal/cli/style";
import { classifyRoutes, manifestSkeleton, routesOfClass } from "./classify.ts";
import { diecast } from "./generate.ts";
import type { GenerationReport, SiteDefinition } from "./types.ts";

/**
 * Describe a site to build. Identity at runtime; it exists for the types.
 *
 * @example
 * ```ts
 * // diecast.ts
 * import { defineSite, runDiecast } from "@bearmetal/diecast";
 * import { router } from "./app.ts";
 * import manifest from "./diecast.manifest.ts";
 *
 * export const site = defineSite({ router, manifest, outDir: "dist" });
 *
 * if (import.meta.main) await runDiecast(site);
 * ```
 */
export function defineSite(site: SiteDefinition): SiteDefinition {
	return site;
}

const USAGE = `diecast - static site generation for the BearMetal router

  build              Render the site into the output directory (default)
  suggest            Report how each route classifies, and scaffold a manifest

Options
  --out=DIR          Output directory, overriding the site's outDir
  --strict           Stop at the first failure instead of reporting them all
  --flat             Write about.html rather than about/index.html
  --concurrency=N    Pages rendered in parallel (default 8)
  --no-links         Do not follow <a href> to further pages
  --no-assets        Do not fetch referenced assets (breaks hydration)
  --no-dirs          Do not copy directories served with serveDirectory
  -h, --help         Show this message
`;

/** The subset of the config the command line can override. */
function applyFlags(site: SiteDefinition, args: string[]): SiteDefinition {
	const flag = (name: string) => args.includes(`--${name}`);
	const value = (name: string) =>
		args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

	const concurrency = value("concurrency");
	return {
		...site,
		outDir: value("out") ?? site.outDir,
		strict: flag("strict") || site.strict,
		outputStyle: flag("flat") ? "flat" : site.outputStyle,
		concurrency: concurrency ? Number(concurrency) : site.concurrency,
		discover: {
			assets: flag("no-assets") ? false : site.discover?.assets,
			links: flag("no-links") ? false : site.discover?.links,
			directories: flag("no-dirs") ? false : site.discover?.directories,
		},
	};
}

/** Print a build report. Returns the process exit code. */
export function printReport(report: GenerationReport): number {
	for (const problem of report.problems) {
		console.error(`${colorize("manifest", "yellow")} ${problem.message}`);
	}
	for (const failure of report.failures) {
		console.error(`${colorize("failed", "red")} ${failure.url} - ${failure.message}`);
	}

	const summary = [
		`${report.pages.length} page${report.pages.length === 1 ? "" : "s"}`,
		report.copiedDirs.length > 0 ? `${report.copiedDirs.length} directories copied` : null,
		`${Math.round(report.duration)}ms`,
	].filter(Boolean).join(", ");

	if (report.ok) {
		console.log(`${colorize("done", "green")} ${summary}`);
		return 0;
	}
	console.error(
		`${colorize("done", "red")} ${summary}, ` +
			`${report.failures.length} failed, ${report.problems.length} manifest problem(s)`,
	);
	return 1;
}

/** Report how each route classifies, and scaffold a manifest for the rest. */
export function printSuggestions(site: SiteDefinition): void {
	const classified = classifyRoutes(site.router);

	const section = (title: string, cls: "static" | "needs-manifest" | "skip") => {
		const routes = routesOfClass(classified, cls);
		if (routes.length === 0) return;
		console.log(`\n${colorize(title, "cyan")}`);
		for (const route of routes) {
			const note = route.class === "needs-manifest"
				? ` (${route.params.join(", ")})`
				: route.reason
				? ` - ${route.reason}`
				: "";
			console.log(`  ${route.path}${note}`);
		}
	};

	section("Generated automatically", "static");
	section("Need manifest permutations", "needs-manifest");
	section("Not generated", "skip");

	const needs = routesOfClass(classified, "needs-manifest");
	if (needs.length > 0) {
		console.log(`\n${colorize("Manifest skeleton", "cyan")}\n`);
		console.log(manifestSkeleton(classified));
	}
}

/**
 * Run diecast's command line against a site, then exit.
 *
 * Call it behind an `import.meta.main` guard so the module stays importable.
 */
export async function runDiecast(
	site: SiteDefinition,
	args: string[] = Deno.args,
): Promise<never> {
	if (args.includes("--help") || args.includes("-h")) {
		console.log(USAGE);
		Deno.exit(0);
	}

	const command = args.find((a) => !a.startsWith("-")) ?? "build";

	if (command === "suggest") {
		await site.router.ready();
		printSuggestions(site);
		Deno.exit(0);
	}

	if (command !== "build") {
		console.error(`unknown command "${command}"\n\n${USAGE}`);
		Deno.exit(2);
	}

	const config = applyFlags(site, args);
	const report = await diecast(config.router, config);
	Deno.exit(printReport(report));
}
