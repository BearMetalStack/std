/**
 * Finding `@components`, `@app`, and `@pages` directories, and working out
 * what one combined bundle entry should import from each.
 *
 * There is exactly one entrypoint, always - `@components`, `@app`, and
 * `@pages` all fold into one synthesized file fed to a single
 * `bundleEntrypoints()` call, because the whole app ships as one bundle (see
 * `@bearmetal/app/ssr`'s `bundleEntrypoints` doc comment for why that's not
 * negotiable). That also means there's nothing for two entrypoints' bundler
 * outputs to collide on.
 *
 * @module
 */

import { walkDir } from "@bearmetal/miscellanea/fs";
import { joinPath } from "@bearmetal/miscellanea";
import { directoryOf } from "@bearmetal/miscellanea/path";

/** File extensions treated as script modules. */
const scriptFiles = ["js", "ts", "jsx", "tsx"];

/** Directories searched, in order, when none was configured. */
export const componentDirs = ["components", "src/components"];
export const appDirs = ["app", "src/app"];
export const pageDirs = ["pages", "src/pages"];

/** Matches any `<name>.manifest.<ext>` file, at any depth. */
const manifestSuffixRx = /\.manifest\.(?:js|ts|jsx|tsx)$/;
const scriptSuffixRx = /\.(?:js|ts|jsx|tsx)$/;

/** Served name of the default bundle, the one referenced from every page. */
export const defaultBundleName = "index";

/** The one thing handed to the bundler, and the name it comes back out under. */
export interface Entrypoint {
	/** Path handed to the bundler - the synthesized combined entry file. */
	path: string;
	/** Output filename the bundler emits for it. */
	output: string;
	/** Name it is served under, after the endpoint prefix. */
	served: string;
}

export interface Resolved {
	/** Always exactly one entry - the combined synthesized file - or none when there was nothing to bundle at all. */
	entrypoints: Entrypoint[];
	/** `@components` manifest sources, imported for their `@define` side effects so components register server-side. */
	sideEffects: string[];
	/** Temp directory holding the synthesized combined entry, unless it was written to {@linkcode ResolveOptions.synthesizeIn}. */
	tempDir?: string;
	/** Candidate keys with a `@components` manifest. Diagnostic only - every one is unioned into the combined bundle regardless of route. */
	componentManifestKeys: Set<string>;
	/** Candidate keys discovered under `@pages`. Drives per-route dispatch resolution. */
	pageKeys: Set<string>;
}

async function findDir(candidates: string[], dir?: string): Promise<string | null> {
	for (const candidate of dir ? [dir] : candidates) {
		try {
			if ((await Deno.stat(candidate)).isDirectory) return candidate;
		} catch {
			// not this one
		}
	}
	return null;
}

/** The first of {@linkcode componentDirs} that exists, or `null`. */
export function findComponentsDir(dir?: string): Promise<string | null> {
	return findDir(componentDirs, dir);
}

/** The first of {@linkcode appDirs} that exists, or `null`. */
export function findAppDir(dir?: string): Promise<string | null> {
	return findDir(appDirs, dir);
}

/** The first of {@linkcode pageDirs} that exists, or `null`. */
export function findPagesDir(dir?: string): Promise<string | null> {
	return findDir(pageDirs, dir);
}

async function fileUrl(path: string): Promise<string> {
	return "file://" + await Deno.realPath(path);
}

/** `entry.path` relative to `root`, posix-style, no leading slash. */
function relativeTo(root: string, entryPath: string): string {
	return entryPath.slice(root.length).replace(/^\//, "");
}

/** Where {@linkcode resolveEntrypoints} reads from and writes to. */
export interface ResolveOptions {
	/**
	 * Layout-identical copies to bundle from instead of the originals, by
	 * convention. Each defaults to the original directory.
	 */
	mirrors?: { components?: string | null; app?: string | null; pages?: string | null };
	/**
	 * Writes the combined entry into this directory, with relative imports, and
	 * only when its content changed — for the dev server, which serves one
	 * directory as a tree of separate modules. Every mirror must sit inside it.
	 */
	synthesizeIn?: string;
}

/**
 * Works out what the one combined bundle entry should import, and which
 * `@components`/`@pages` candidate keys exist.
 *
 * The directories are where the code really is, and `@components` is what the
 * server imports for `@define` side effects. The entry imports from
 * `options.mirrors` instead where given: the stripped copies the bundler is
 * allowed to see.
 */
export async function resolveEntrypoints(
	componentsDir: string | null,
	appDir: string | null,
	pagesDir: string | null,
	options: ResolveOptions = {},
): Promise<Resolved> {
	const componentManifestKeys = new Set<string>();
	const pageKeys = new Set<string>();
	const imports: string[] = [];
	const sideEffects: string[] = [];
	const mirrors = options.mirrors ?? {};

	/** The path the entry imports for `rel` under `dir`, read from its mirror when there is one. */
	const bundled = (dir: string, mirror: string | null | undefined, rel: string) =>
		joinPath(mirror ?? dir, rel);

	if (componentsDir) {
		const manifests: { key: string; source: string; rel: string }[] = [];
		for await (const entry of walkDir(componentsDir)) {
			if (!entry.isFile || !manifestSuffixRx.test(entry.name)) continue;
			const rel = relativeTo(componentsDir, entry.path);
			manifests.push({ key: rel.replace(manifestSuffixRx, ""), source: entry.path, rel });
		}

		if (manifests.length > 0) {
			for (const manifest of manifests) {
				componentManifestKeys.add(manifest.key);
				imports.push(bundled(componentsDir, mirrors.components, manifest.rel));
				sideEffects.push(await fileUrl(manifest.source));
			}
		} else {
			// Zero-config: no manifest anywhere, so every component in the
			// directory ships, exactly as if one big manifest listed them all.
			for await (const entry of walkDir(componentsDir)) {
				if (!entry.isFile) continue;
				if (manifestSuffixRx.test(entry.name)) continue;
				if (!scriptFiles.includes(entry.name.split(".").pop()!)) continue;
				const rel = relativeTo(componentsDir, entry.path);
				imports.push(bundled(componentsDir, mirrors.components, rel));
				sideEffects.push(await fileUrl(entry.path));
			}
		}
	}

	if (appDir) {
		for await (const entry of walkDir(appDir)) {
			if (!entry.isFile) continue;
			if (!scriptFiles.includes(entry.name.split(".").pop()!)) continue;
			imports.push(bundled(appDir, mirrors.app, relativeTo(appDir, entry.path)));
		}
	}

	if (pagesDir) {
		for await (const entry of walkDir(pagesDir)) {
			if (!entry.isFile) continue;
			if (!scriptFiles.includes(entry.name.split(".").pop()!)) continue;
			const rel = relativeTo(pagesDir, entry.path);
			pageKeys.add(rel.replace(scriptSuffixRx, ""));
			imports.push(bundled(pagesDir, mirrors.pages, rel));
		}
	}

	if (imports.length === 0) {
		return { entrypoints: [], sideEffects, componentManifestKeys, pageKeys };
	}

	const tempDir = options.synthesizeIn ? undefined : await Deno.makeTempDir();
	const dir = options.synthesizeIn ?? tempDir!;
	// Named distinctly: outputs are keyed by entrypoint basename, and a bare
	// `index.ts` would collide with `@bearmetal/app/signals`'s own index.ts.
	const synthesized = joinPath(dir, "bearmetal-app.ts");
	const lines: string[] = [];
	for (const path of imports) {
		const real = await Deno.realPath(path);
		const spec = options.synthesizeIn ? `./${relativeTo(dir, path)}` : `file://${real}`;
		lines.push(`import ${JSON.stringify(spec)};`);
	}
	if (pageKeys.size > 0) {
		lines.push(`import { dispatch } from "@bearmetal/app";`, "dispatch();");
	}
	const content = lines.join("\n") + "\n";
	const current = await Deno.readTextFile(synthesized).catch(() => null);
	if (current !== content) await Deno.writeTextFile(synthesized, content);

	return {
		entrypoints: [{ path: synthesized, output: "bearmetal-app.js", served: defaultBundleName }],
		sideEffects,
		tempDir,
		componentManifestKeys,
		pageKeys,
	};
}

/**
 * Keys emitted files by the name they are served under. The entry output
 * takes the entrypoint's served name; shared chunks keep their emitted
 * filename, so the relative imports inside the entry resolve against the
 * endpoint.
 */
export function serveMap(
	entrypoints: Entrypoint[],
	scripts: Map<string, string>,
): Map<string, string> {
	const byOutput = new Map(entrypoints.map((e) => [e.output, e.served]));
	const served = new Map<string, string>();
	for (const [name, code] of scripts) served.set(byOutput.get(name) ?? name, code);
	return served;
}

/**
 * The app's own `jsxImportSource`, for the stripped `@components` mirror's
 * pragma.
 *
 * Read from the config Deno itself resolved rather than assumed, because a
 * copy of a component outside the project gets no `compilerOptions` at all
 * and the pragma is the only thing that tells the bundler which runtime
 * built the JSX. Guessing `@bearmetal/jsx` would be right for most apps and
 * silently wrong for one that points somewhere else.
 */
export async function appJsxImportSource(from = "."): Promise<string | undefined> {
	let dir = await Deno.realPath(from).catch(() => null);
	while (dir) {
		for (const name of ["deno.json", "deno.jsonc"]) {
			const config = await readJson(joinPath(dir, name));
			const source = config?.compilerOptions?.jsxImportSource;
			if (typeof source === "string") return source;
		}
		const parent = directoryOf(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

/**
 * The app's own local import-map aliases (`@components/`, `@app/`, ...),
 * absolutized to `file://` URLs, for the stripped `@components` mirror.
 *
 * `Deno.bundle` resolves a `jsr:`/`npm:` specifier the same wherever the
 * importing file sits, through the global cache - but a *local* path alias
 * only resolves through whatever `deno.json` is nearest the file being
 * resolved, and the mirror lives outside the project entirely. Without this,
 * a component importing `@app/stores/users.ts` bundles to nothing (silently:
 * `Deno.bundle` fails the whole entry and `bundleEntrypoints` has no scripts
 * to show for it) the moment the mirror has no `deno.json` of its own saying
 * what `@app/` means. Writing one into the mirror root with these aliases
 * pre-resolved to their real, absolute location fixes that the same way the
 * JSX pragma fixes `compilerOptions` not reaching a copy outside the project.
 */
export async function localImportAliases(from = "."): Promise<Record<string, string> | undefined> {
	let dir = await Deno.realPath(from).catch(() => null);
	while (dir) {
		for (const name of ["deno.json", "deno.jsonc"]) {
			const config = await readJson(joinPath(dir, name));
			if (config?.imports) return absolutizeLocalAliases(config.imports, dir);
		}
		const parent = directoryOf(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return undefined;
}

/** Whether an import map value is a local filesystem path rather than a `jsr:`/`npm:`/URL specifier. */
function isLocalAliasValue(value: string): boolean {
	return !/^(?:jsr:|npm:|https?:|file:)/.test(value);
}

function absolutizeLocalAliases(
	imports: Record<string, unknown>,
	configDir: string,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(imports)) {
		if (typeof value !== "string" || !isLocalAliasValue(value)) continue;
		const abs = joinPath(configDir, value);
		result[key] = key.endsWith("/") ? `file://${abs}/` : `file://${abs}`;
	}
	return result;
}

type PartialConfig = {
	compilerOptions?: { jsxImportSource?: unknown };
	imports?: Record<string, unknown>;
};

async function readJson(path: string): Promise<PartialConfig | null> {
	try {
		// `jsonc` is close enough to JSON for the one key that matters here once
		// comments are out of the way; a config this cannot read simply falls
		// through to the next candidate.
		const text = (await Deno.readTextFile(path))
			.replace(/^\s*\/\/.*$/gm, "")
			.replace(/,(\s*[}\]])/g, "$1");
		return JSON.parse(text) as PartialConfig;
	} catch {
		return null;
	}
}
