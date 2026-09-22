import { directoryOf, joinPath } from "@bearmetal/miscellanea";

/** A local module compiled on its own, with every import left for the browser to resolve. */
export interface CompiledModule {
	code: string;
	/** Absolute paths of the local modules it imports. */
	local: string[];
	/** Bare specifiers it imports, which the browser resolves through the vendor import map. */
	bare: string[];
}

const SCRIPT = /\.[cm]?[jt]sx?$/;
const SPECIFIER = /\bfrom\s*["']([^"'\n]+)["']|\bimport\s*\(?\s*["']([^"'\n]+)["']/g;
const JSX_RUNTIME = ["*/jsx-runtime", "*/jsx-dev-runtime"];

/** Whether `path` is a module the dev server compiles. */
export function isScript(path: string): boolean {
	return SCRIPT.test(path);
}

/**
 * Every string that looks like an import specifier in `code`.
 *
 * Deliberately over-inclusive: the result is only ever used as a bundler
 * `external` list or intersected with one, where a string that is not really
 * an import changes nothing.
 */
function specifiers(code: string): Set<string> {
	const found = new Set<string>();
	for (const m of code.matchAll(SPECIFIER)) found.add(m[1] ?? m[2]);
	return found;
}

/** Replaces every import specifier in `code` with what `map` returns for it. */
function rewriteSpecifiers(code: string, map: (specifier: string) => string): string {
	return code.replace(SPECIFIER, (match, from?: string, dynamic?: string) => {
		const specifier = from ?? dynamic!;
		const next = map(specifier);
		return next === specifier ? match : match.replace(specifier, next);
	});
}

function isRelative(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function isBare(specifier: string): boolean {
	return !isRelative(specifier) && !specifier.startsWith("/") &&
		!/^(https?|data|blob):/.test(specifier);
}

/** Thrown when the bundler rejects a module. */
export class CompileError extends Error {
	constructor(what: string, detail: string) {
		super(`Could not compile ${what}:\n${detail.replace(/^/gm, "  ")}`);
		this.name = "CompileError";
	}
}

/**
 * The `deno` to bundle with: `BMDEV_DENO` if set, else this process when it is
 * `deno` itself, else whichever `deno` is on the `PATH`.
 *
 * The bundler runs as a subprocess rather than through `Deno.bundle` because
 * a compiled binary — a `deno compile` or `deno desktop` app — has no bundler
 * in it, and there `Deno.execPath()` is the app, not `deno`.
 */
function denoExecutable(): string {
	const env = { name: "env", variable: "BMDEV_DENO" } as const;
	if (Deno.permissions.querySync(env).state === "granted") {
		const override = Deno.env.get("BMDEV_DENO");
		if (override) return override;
	}
	try {
		const exec = Deno.execPath();
		if (/^deno(\.exe)?$/i.test(exec.split(/[\\/]/).pop() ?? "")) return exec;
	} catch {
		// No read access to the executable's path.
	}
	return "deno";
}

/**
 * Runs `deno bundle` from `cwd`, so it finds the same config — and so the same
 * import map — the app itself runs with. Returns the error output on failure.
 */
async function runBundle(args: string[], cwd: string): Promise<string | undefined> {
	const { success, stderr } = await new Deno.Command(denoExecutable(), {
		args: ["bundle", "--platform=browser", "--format=esm", "--sourcemap=inline", ...args],
		cwd,
		env: { NO_COLOR: "1" },
		stdin: "null",
		stdout: "null",
		stderr: "piped",
	}).output();
	if (success) return undefined;
	return new TextDecoder().decode(stderr).split("\n")
		.filter((line) => line.trim() && !/is experimental|^error: bundling failed/.test(line))
		.join("\n");
}

/** The deepest directory containing every one of `paths`. */
function commonDirectory(paths: string[]): string {
	const dirs = paths.map((p) => directoryOf(p).split("/"));
	let n = 0;
	while (dirs.every((d) => n < d.length && d[n] === dirs[0][n])) n++;
	return dirs[0].slice(0, n).join("/") || "/";
}

async function readTree(dir: string, into = new Map<string, string>(), prefix = "") {
	for await (const entry of Deno.readDir(joinPath(dir, prefix))) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory) await readTree(dir, into, rel);
		else into.set(rel, await Deno.readTextFile(joinPath(dir, rel)));
	}
	return into;
}

/**
 * Maps an import-map alias to the local file it names, or `undefined` when it
 * names anything else. See {@linkcode loadLocalAliases}.
 */
export type AliasResolver = (specifier: string) => string | undefined;

/**
 * Reads the import map of the Deno config governing `root` — the nearest
 * `deno.json`/`deno.jsonc` at or above it, or the file its `importMap` names —
 * and returns a resolver for the aliases that point at files under `root`.
 *
 * Those aliases (`"@components/": "./src/components/"`) look bare, but they
 * name the app's own modules. Vendoring them would bundle the app into the
 * vendor build, where nothing hot-replaces and a module also reached by a
 * relative path loads twice. They are rewritten to relative imports instead.
 */
export async function loadLocalAliases(root: string): Promise<AliasResolver> {
	const map = await findImportMap(root);
	if (!map) return () => undefined;
	const entries = Object.entries(map.imports)
		.map(([key, value]) => [key, localTarget(value, map.dir)] as const)
		.filter((e): e is readonly [string, string] => e[1] !== undefined);
	const exact = new Map(entries.filter(([k]) => !k.endsWith("/")));
	const prefixes = entries.filter(([k, v]) => k.endsWith("/") && v.endsWith("/"))
		.sort(([a], [b]) => b.length - a.length);

	return (specifier) => {
		let target = exact.get(specifier);
		if (target === undefined) {
			const prefix = prefixes.find(([k]) => specifier.startsWith(k));
			if (prefix) target = prefix[1] + specifier.slice(prefix[0].length);
		}
		if (target === undefined) return undefined;
		target = joinPath(target);
		return target.startsWith(`${root}/`) ? target : undefined;
	};
}

/**
 * The directory of the Deno config governing `root` — the nearest
 * `deno.json`/`deno.jsonc` at or above it — which is where the bundler is run
 * from. `undefined` when there is none.
 */
export async function findConfigDir(root: string): Promise<string | undefined> {
	return (await findConfig(root))?.dir;
}

async function findConfig(
	root: string,
): Promise<{ config: Record<string, unknown>; dir: string } | undefined> {
	for (let dir = root;; dir = directoryOf(dir)) {
		for (const name of ["deno.json", "deno.jsonc"]) {
			const config = await readJson(joinPath(dir, name));
			if (config) return { config, dir };
		}
		if (dir === "/") return undefined;
	}
}

async function findImportMap(
	root: string,
): Promise<{ imports: Record<string, string>; dir: string } | undefined> {
	const found = await findConfig(root);
	if (!found) return undefined;
	const { config, dir } = found;
	if (typeof config.importMap === "string") {
		const file = joinPath(dir, config.importMap);
		const external = await readJson(file);
		return { imports: asImports(external?.imports), dir: directoryOf(file) };
	}
	return { imports: asImports(config.imports), dir };
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
	let text: string;
	try {
		text = await Deno.readTextFile(path);
	} catch {
		return undefined;
	}
	try {
		return JSON.parse(text);
	} catch {
		// jsonc: drop comments and trailing commas, leaving strings alone.
		return JSON.parse(
			text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, str) => str ?? "")
				.replace(/,(\s*[}\]])/g, "$1"),
		);
	}
}

function asImports(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object") return {};
	return Object.fromEntries(
		Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"),
	);
}

/** The absolute path an import-map value names, if it names a local path. */
function localTarget(value: string, dir: string): string | undefined {
	if (value.startsWith("file://")) return decodeURIComponent(new URL(value).pathname);
	if (value.startsWith("/")) return value;
	if (isRelative(value)) return joinPath(dir, value) + (value.endsWith("/") ? "/" : "");
	return undefined;
}

/** A relative import specifier from the module at `from` to the file at `to`. */
function relativeSpecifier(from: string, to: string): string {
	const a = directoryOf(from).split("/").filter(Boolean);
	const b = to.split("/").filter(Boolean);
	let i = 0;
	while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
	const up = a.length - i;
	return (up ? "../".repeat(up) : "./") + b.slice(i).join("/");
}

/**
 * The query a stylesheet import is rewritten to carry, so the server answers it
 * with a module that links the stylesheet instead of the stylesheet itself.
 */
export const CSS_MODULE_QUERY = "bmdev=css";

/**
 * Compiles modules without bundling anything into them, in one `deno bundle`
 * run, keyed by path.
 *
 * Every specifier they import is marked external, the JSX runtime included, so
 * the browser resolves each one itself: local modules back to this server and
 * packages to the shared vendor build. That is what lets a re-imported module
 * share the page's single copy of every dependency instead of carrying its own.
 * Pooling every module's specifiers into one external list changes nothing,
 * since all of them are external anyway.
 *
 * If the batch fails, each module is compiled on its own, so the error names
 * the module that caused it.
 *
 * @param cwd where to run the bundler, so it finds the app's config.
 */
export async function compileModules(
	paths: string[],
	cwd: string,
	aliases: AliasResolver = () => undefined,
): Promise<Map<string, CompiledModule>> {
	const compiled = new Map<string, CompiledModule>();
	if (!paths.length) return compiled;

	const candidates = new Map<string, Set<string>>();
	for (const path of paths) candidates.set(path, specifiers(await Deno.readTextFile(path)));
	const external = new Set([...candidates.values()].flatMap((c) => [...c]));
	JSX_RUNTIME.forEach((s) => external.add(s));

	const outDir = await Deno.makeTempDir({ prefix: "bmdev-compile-" });
	try {
		const error = await runBundle([
			`--outdir=${outDir}`,
			...[...external].map((s) => `--external=${s}`),
			...paths,
		], cwd);
		if (error !== undefined) {
			if (paths.length === 1) throw new CompileError(paths[0], error);
			for (const path of paths) {
				const [one] = await compileModules([path], cwd, aliases);
				compiled.set(...one);
			}
			return compiled;
		}

		// The bundler lays entries out under the deepest directory they share.
		const base = commonDirectory(paths);
		for (const path of paths) {
			const out = joinPath(outDir, path.slice(base.length).replace(SCRIPT, ".js"));
			const output = await Deno.readTextFile(out);
			compiled.set(path, finish(path, output, candidates.get(path)!, aliases));
		}
		return compiled;
	} finally {
		await Deno.remove(outDir, { recursive: true }).catch(() => {});
	}
}

/** Resolves a compiled module's imports: aliases made relative, stylesheets made modules. */
function finish(
	path: string,
	output: string,
	candidates: Set<string>,
	aliases: AliasResolver,
): CompiledModule {
	const body = stripSourceMap(output);
	const code = rewriteSpecifiers(body, (specifier) => {
		const aliased = aliases(specifier);
		if (aliased) specifier = relativeSpecifier(path, aliased);
		if (isRelative(specifier) && /\.css$/i.test(specifier)) {
			return `${specifier}?${CSS_MODULE_QUERY}`;
		}
		return specifier;
	}) + output.slice(body.length);

	const local: string[] = [];
	const bare: string[] = [];
	for (const specifier of specifiers(stripSourceMap(code))) {
		if (specifier.endsWith(`?${CSS_MODULE_QUERY}`)) {
			local.push(joinPath(directoryOf(path), specifier.slice(0, -CSS_MODULE_QUERY.length - 1)));
			continue;
		}
		if (isRelative(specifier)) local.push(joinPath(directoryOf(path), specifier));
		else if (
			isBare(specifier) && (candidates.has(specifier) || /\/jsx-(dev-)?runtime$/.test(specifier))
		) bare.push(specifier);
	}
	return { code, local, bare };
}

/** A build of every bare specifier the page imports, split so shared code loads once. */
export interface VendorBuild {
	id: number;
	specifiers: Set<string>;
	/** Import map entries, specifier to served URL. */
	imports: Record<string, string>;
	/** Output files by name. */
	files: Map<string, string>;
	/** Absolute paths of every source file the build read. */
	sources: Set<string>;
}

let workDir: Promise<string> | undefined;
let nextId = 0;

/**
 * Builds `specs` as one code-split bundle served under `base`.
 *
 * Each specifier gets a small entry that re-exports it, so a package reached
 * through several specifiers (`@bearmetal/app` and `@bearmetal/app/signals`)
 * still evaluates once: the shared part lands in a chunk both entries import.
 *
 * @param cwd where to run the bundler, so the entries — which sit in a temp
 * directory — resolve through the app's import map.
 */
export async function buildVendor(
	specs: Set<string>,
	base: string,
	cwd: string,
): Promise<VendorBuild> {
	workDir ??= Deno.makeTempDir({ prefix: "bmdev-vendor-" });
	const dir = await workDir;
	const id = nextId++;
	const inDir = joinPath(dir, `in-${id}`);
	const outDir = joinPath(dir, `out-${id}`);
	const list = [...specs];
	await Deno.mkdir(inDir, { recursive: true });

	const entrypoints = await Promise.all(list.map(async (spec, i) => {
		const entry = joinPath(inDir, `v${i}.js`);
		const s = JSON.stringify(spec);
		await Deno.writeTextFile(
			entry,
			`import * as m from ${s};\nexport * from ${s};\nexport default m.default;\n`,
		);
		return entry;
	}));

	let files: Map<string, string>;
	try {
		const error = await runBundle(["--code-splitting", `--outdir=${outDir}`, ...entrypoints], cwd);
		if (error !== undefined) throw new CompileError("the vendor build", error);
		files = await readTree(outDir);
	} finally {
		await Deno.remove(inDir, { recursive: true }).catch(() => {});
		await Deno.remove(outDir, { recursive: true }).catch(() => {});
	}

	const sources = new Set<string>();
	for (const [name, text] of files) {
		for (const source of sourceMapSources(text, directoryOf(joinPath(outDir, name)))) {
			sources.add(source);
		}
	}

	const imports: Record<string, string> = {};
	list.forEach((spec, i) => imports[spec] = `${base}/${id}/v${i}.js`);
	return { id, specifiers: new Set(specs), imports, files, sources };
}

function stripSourceMap(code: string): string {
	const at = code.lastIndexOf("//# sourceMappingURL=");
	return at === -1 ? code : code.slice(0, at);
}

/** The local files a compiled output's inline source map names, as absolute paths. */
function sourceMapSources(code: string, dir: string): string[] {
	const m = code.match(/^\/\/# sourceMappingURL=data:application\/json;base64,(.*)$/m);
	if (!m) return [];
	try {
		const { sources = [] } = JSON.parse(atob(m[1])) as { sources?: string[] };
		return sources.filter((s) => !/^[a-z]+:/.test(s)).map((s) => joinPath(dir, s));
	} catch {
		return [];
	}
}
