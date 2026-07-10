/**
 * Shared workspace discovery for the scripts in this directory.
 *
 * Every other script here goes through {@linkcode discoverPackages} rather than
 * walking the filesystem itself. Before this module existed each script decided
 * "is this directory a package?" differently - `dep_graph.ts` globbed the
 * `workspace` field, `version_bump.ts` read only the top-level directories -
 * so a package could be visible to one script and invisible to another.
 */

import { expandGlob } from "@std/fs/expand-glob";
import { fromFileUrl, join, relative, resolve } from "@std/path";

/** A JSR-style scope, including the leading `@`. */
export type ScopeString = `@${string}`;

/** The scope that marks a workspace directory as one of our packages. */
export const SCOPE: ScopeString = "@bearmetal";

/** Absolute path to the repository root, independent of the current directory. */
export const REPO_ROOT: string = resolve(fromFileUrl(new URL("..", import.meta.url)));

/** The subset of `deno.json` these scripts care about. */
export interface DenoConfig {
	name?: string;
	version?: string;
	/** `false` marks an internal-only package that is never pushed to JSR. */
	publish?: boolean | { exclude?: string[]; include?: string[] };
	workspace?: string[];
	exports?: string | Record<string, string>;
}

/** A workspace directory that is a real, scoped package. */
export interface WorkspacePackage {
	/** Fully qualified name, e.g. `@bearmetal/router`. */
	name: string;
	/** Path relative to the repo root, e.g. `router` or `app/examples/counter-app`. */
	dir: string;
	/** Absolute path to the package directory. */
	path: string;
	/** Version from `deno.json`, or `0.0.0` when unset. */
	version: string;
	/** False when `deno.json` says `"publish": false`. Such packages still appear in the graph. */
	publishable: boolean;
	config: DenoConfig;
}

/**
 * Directories that never contain first-party source. Used when walking a
 * package for its imports; discovery itself relies on `deno.json` alone.
 */
const IGNORED_DIRS: ReadonlySet<string> = new Set([
	".git",
	"node_modules",
	"dist",
	"prod",
	"coverage",
	"vendor",
	// Demo apps live inside their package (`app/examples/*`); their imports are
	// not the package's own dependencies.
	"examples",
]);

/** File suffixes excluded from dependency scanning - not shipped, not part of the public graph. */
const IGNORED_FILE_SUFFIXES: readonly string[] = [
	".test.ts",
	".test.tsx",
	"_test.ts",
	"_test.tsx",
	".bench.ts",
	"temp.ts",
	"example.ts",
];

const SOURCE_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".js", ".jsx", ".mts"];

/** Reads and parses a `deno.json` from `dir`, or returns null if absent/unparseable. */
export async function readDenoConfig(dir: string): Promise<DenoConfig | null> {
	try {
		return JSON.parse(await Deno.readTextFile(join(dir, "deno.json"))) as DenoConfig;
	} catch {
		return null;
	}
}

/**
 * True when `dir` holds a `deno.json` whose `name` is inside `scope`.
 *
 * The trailing slash matters: without it `@bearmetal` would also match a
 * package named `@bearmetalsomething`.
 */
export async function isPackage(dir: string, scope: ScopeString = SCOPE): Promise<boolean> {
	const config = await readDenoConfig(dir);
	return !!config?.name?.startsWith(`${scope}/`);
}

/** Returns true when `publish` is anything other than an explicit `false`. */
function isPublishable(config: DenoConfig): boolean {
	return config.publish !== false;
}

/**
 * Finds every scoped package in the workspace, in stable name order.
 *
 * Expands the `workspace` globs from the root `deno.json`, so packages nested
 * under `examples/` are discovered on exactly the same terms as top-level ones.
 */
export async function discoverPackages(scope: ScopeString = SCOPE): Promise<WorkspacePackage[]> {
	const root = await readDenoConfig(REPO_ROOT);
	if (!root) throw new Error(`no deno.json at repo root: ${REPO_ROOT}`);

	const byName = new Map<string, WorkspacePackage>();

	for (const pattern of root.workspace ?? []) {
		for await (
			const entry of expandGlob(join(REPO_ROOT, pattern), {
				followSymlinks: false,
				includeDirs: true,
			})
		) {
			if (!entry.isDirectory) continue;

			const config = await readDenoConfig(entry.path);
			if (!config?.name?.startsWith(`${scope}/`)) continue;

			// Overlapping globs can yield the same directory twice.
			if (byName.has(config.name)) continue;

			byName.set(config.name, {
				name: config.name,
				dir: relative(REPO_ROOT, entry.path),
				path: entry.path,
				version: config.version ?? "0.0.0",
				publishable: isPublishable(config),
				config,
			});
		}
	}

	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Yields absolute paths of the source files belonging to `pkg`.
 *
 * `skipDirs` should hold the absolute paths of any packages nested inside this
 * one, so their sources are attributed to them rather than to their parent.
 */
export async function* sourceFiles(
	pkg: WorkspacePackage,
	skipDirs: Iterable<string> = [],
): AsyncGenerator<string> {
	yield* walk(pkg.path, new Set(skipDirs));
}

async function* walk(dir: string, skip: ReadonlySet<string>): AsyncGenerator<string> {
	for await (const entry of Deno.readDir(dir)) {
		const path = join(dir, entry.name);
		if (entry.isDirectory) {
			if (IGNORED_DIRS.has(entry.name) || skip.has(path)) continue;
			yield* walk(path, skip);
			continue;
		}
		if (!entry.isFile) continue;
		if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
		if (IGNORED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) continue;
		yield path;
	}
}

/**
 * Reduces a module specifier to the workspace package it refers to, or null.
 *
 * Handles the shapes that actually appear in this repo: bare
 * (`@bearmetal/jsx`), registry-prefixed (`jsr:@bearmetal/router`), versioned
 * (`jsr:@bearmetal/db@^0.0.8`), and sub-path (`@bearmetal/jsx/server`).
 */
export function specifierToPackage(specifier: string, scope: ScopeString = SCOPE): string | null {
	const bare = specifier.replace(/^(?:jsr|npm|https?):(?:\/\/)?/, "");
	if (!bare.startsWith(`${scope}/`)) return null;
	// Name runs from after the scope up to the next `/` (sub-path) or `@` (version).
	const match = bare.slice(scope.length + 1).match(/^[^/@]+/);
	return match ? `${scope}/${match[0]}` : null;
}

const SPECIFIER_PATTERNS: readonly RegExp[] = [
	// `import x from "..."` / `export * from "..."`
	/\bfrom\s*["']([^"']+)["']/g,
	// bare side-effect import: `import "..."`
	/\bimport\s+["']([^"']+)["']/g,
	// dynamic: `import("...")`
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/** Extracts every module specifier referenced by a source file's text. */
export function extractSpecifiers(source: string): string[] {
	const found = new Set<string>();
	for (const pattern of SPECIFIER_PATTERNS) {
		for (const match of source.matchAll(pattern)) found.add(match[1]);
	}
	return [...found];
}
