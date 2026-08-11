/**
 * Finding the components directory and working out what to bundle from it.
 *
 * @module
 */

import { walkDir } from "@bearmetal/miscellanea/fs";
import { joinPath } from "@bearmetal/miscellanea";
import { directoryOf } from "@bearmetal/miscellanea/path";

/** File extensions treated as component modules. */
const scriptFiles = ["js", "ts", "jsx", "tsx"];

/** Directories searched, in order, when none was configured. */
export const componentDirs = ["components", "src/components"];

/** Matches `manifest.ts` (the default bundle) and `<subset>.manifest.ts` (a named one). */
const manifestRx = /^(?:(?<subset>.+)\.)?manifest\.(?:js|ts|jsx|tsx)$/;

/** Served name of the default bundle, the one referenced from every page. */
export const defaultBundleName = "index";

/** One thing handed to the bundler, and the name it comes back out under. */
export type Entrypoint = {
	/** Path handed to the bundler — in the stripped mirror, when there is one. */
	path: string;
	/** The real file, which is what the server imports for its side effects. */
	source: string;
	/** Output filename the bundler emits for it, named after the entrypoint's basename. */
	output: string;
	/** Name it is served under, after the endpoint prefix. */
	served: string;
};

export type Resolved = {
	entrypoints: Entrypoint[];
	/** Modules to import for their `@define` side effects, so components register server-side. */
	sideEffects: string[];
	/** Temp directory holding a synthesized entry, when there is no `manifest.ts`. */
	tempDir?: string;
};

/** The first of {@linkcode componentDirs} that exists, or `null`. */
export async function findComponentsDir(dir?: string): Promise<string | null> {
	for (const candidate of dir ? [dir] : componentDirs) {
		try {
			if ((await Deno.stat(candidate)).isDirectory) return candidate;
		} catch {
			// not this one
		}
	}
	return null;
}

function outputName(file: string): string {
	return file.replace(/\.(?:js|ts|jsx|tsx)$/, ".js");
}

async function fileUrl(path: string): Promise<string> {
	return "file://" + await Deno.realPath(path);
}

/**
 * Works out what to bundle.
 *
 * A `manifest.ts` in the components directory *replaces* the default glob of
 * every component under it. Each `<subset>.manifest.ts` becomes its own bundle,
 * served under its subset name. With no `manifest.ts`, a temporary entry that
 * imports every component in the directory stands in for it.
 *
 * `dir` is where the components really are, and is what the server imports.
 * `bundleDir` is the layout-identical tree the bundler reads instead — the
 * stripped mirror. They are the same directory only when nothing was stripped.
 */
export async function resolveEntrypoints(dir: string, bundleDir: string = dir): Promise<Resolved> {
	const subsets: Entrypoint[] = [];
	let defaultEntry: Entrypoint | undefined;

	for await (const entry of Deno.readDir(dir)) {
		if (!entry.isFile) continue;
		const match = entry.name.match(manifestRx);
		if (!match) continue;

		const subset = match.groups?.subset;
		const resolved: Entrypoint = {
			path: joinPath(bundleDir, entry.name),
			source: joinPath(dir, entry.name),
			output: outputName(entry.name),
			served: subset ?? defaultBundleName,
		};
		if (subset) subsets.push(resolved);
		else defaultEntry = resolved;
	}

	if (defaultEntry) {
		const sources = [defaultEntry, ...subsets].map((e) => e.source);
		return {
			entrypoints: [defaultEntry, ...subsets],
			sideEffects: await Promise.all(sources.map(fileUrl)),
		};
	}

	const components: string[] = [];
	const bundled: string[] = [];
	for await (const entry of walkDir(dir)) {
		if (!entry.isFile) continue;
		if (manifestRx.test(entry.name)) continue;
		if (!scriptFiles.includes(entry.name.split(".").pop()!)) continue;
		components.push(await fileUrl(entry.path));
		bundled.push("file://" + joinPath(bundleDir, entry.path.slice(dir.length).replace(/^\//, "")));
	}

	if (components.length === 0) {
		return {
			entrypoints: subsets,
			sideEffects: await Promise.all(subsets.map((e) => fileUrl(e.source))),
		};
	}

	const tempDir = await Deno.makeTempDir();
	// Named distinctly: outputs are keyed by entrypoint basename, and a bare
	// `index.ts` would collide with `@bearmetal/app/signals`'s own index.ts.
	const synthesized = joinPath(tempDir, "bearmetal-components.ts");
	await Deno.writeTextFile(
		synthesized,
		bundled.map((url) => `import "${url}";`).join("\n"),
	);

	return {
		entrypoints: [
			{
				path: synthesized,
				source: synthesized,
				output: "bearmetal-components.js",
				served: defaultBundleName,
			},
			...subsets,
		],
		sideEffects: [...components, ...await Promise.all(subsets.map((e) => fileUrl(e.source)))],
		tempDir,
	};
}

/**
 * Keys emitted files by the name they are served under. Entry outputs take
 * their entrypoint's served name; shared chunks keep their emitted filename, so
 * that the relative imports inside each entry resolve against the endpoint.
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
 * The app's own `jsxImportSource`, for the stripped mirror's pragma.
 *
 * Read from the config Deno itself resolved rather than assumed, because a copy
 * of a component outside the project gets no `compilerOptions` at all and the
 * pragma is the only thing that tells the bundler which runtime built the JSX.
 * Guessing `@bearmetal/jsx` would be right for most apps and silently wrong for
 * one that points somewhere else.
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

type PartialConfig = { compilerOptions?: { jsxImportSource?: unknown } };

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
