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

function isRelative(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function isBare(specifier: string): boolean {
	return !isRelative(specifier) && !specifier.startsWith("/") &&
		!/^(https?|data|blob):/.test(specifier);
}

/** Thrown when the bundler rejects a module. */
export class CompileError extends Error {
	constructor(path: string, messages: Deno.bundle.Message[]) {
		super(`Could not compile ${path}:\n${messages.map((m) => `  ${m.text}`).join("\n")}`);
		this.name = "CompileError";
	}
}

/**
 * Compiles one module without bundling anything into it.
 *
 * Every specifier it imports is marked external, the JSX runtime included, so
 * the browser resolves each one itself: local modules back to this server and
 * packages to the shared vendor build. That is what lets a re-imported module
 * share the page's single copy of every dependency instead of carrying its own.
 */
export async function compileModule(path: string): Promise<CompiledModule> {
	const candidates = specifiers(await Deno.readTextFile(path));
	const result = await Deno.bundle({
		entrypoints: [path],
		write: false,
		platform: "browser",
		format: "esm",
		sourcemap: "inline",
		external: [...candidates, ...JSX_RUNTIME],
	});
	const code = result.outputFiles?.[0]?.text();
	if (!result.success || code === undefined) throw new CompileError(path, result.errors);

	const local: string[] = [];
	const bare: string[] = [];
	for (const specifier of specifiers(stripSourceMap(code))) {
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
 */
export async function buildVendor(specs: Set<string>, base: string): Promise<VendorBuild> {
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

	const result = await Deno.bundle({
		entrypoints,
		outputDir: outDir,
		write: false,
		platform: "browser",
		format: "esm",
		sourcemap: "inline",
		codeSplitting: true,
	});
	if (!result.success) throw new CompileError("the vendor build", result.errors);

	const files = new Map<string, string>();
	const sources = new Set<string>();
	for (const file of result.outputFiles ?? []) {
		const text = file.text();
		files.set(file.path.slice(outDir.length + 1), text);
		for (const source of sourceMapSources(text, directoryOf(file.path))) sources.add(source);
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
