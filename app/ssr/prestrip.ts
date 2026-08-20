/**
 * Removing server-only code *before* the bundler sees it.
 *
 * Emptying `serverInit` in the bundler's output — which is what
 * `./stripServer.ts` does on its own — deletes the body and nothing else. By
 * then the module graph has already been walked, so everything that body
 * imported is in the bundle regardless:
 *
 * ```ts
 * import { db } from "../db.ts";        // still bundled, in full
 * override async serverInit() {
 *   this.rows.set(await db.query("select … from customers"));
 * }                                     // emptied, too late
 * ```
 *
 * The queries, the table names, the internal URLs and the whole dependency tree
 * behind them ship to the browser. Stripping first is the only way the import
 * ever becomes unused, and an unused import is one the bundler can drop.
 *
 * `Deno.bundle` takes no loader hook, so the strip cannot be a plugin. Instead
 * the source tree is mirrored into a temporary directory with the bodies gone,
 * and the bundler is pointed at the copy. The mirror keeps the original layout,
 * so a relative import between two files in the tree still resolves — to the
 * stripped copy, which is the point. A relative import that leaves the tree is
 * rewritten to an absolute `file:` URL of the original, since there is no copy
 * of it to reach.
 *
 * The server keeps importing the originals. Only the bundle sees the copies.
 *
 * @module
 */

import { walkDir } from "@bearmetal/miscellanea/fs";
import { directoryOf } from "@bearmetal/miscellanea/path";
import { scanMask, stripServerCode } from "./stripServer.ts";

/** Extensions whose contents are source, and so worth transforming. */
const SCRIPT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

/** Extensions the JSX pragma is worth prepending to. */
const JSX_EXTENSIONS = [".tsx", ".jsx"];

/** A mirrored copy of a source tree, with the server-only code taken out. */
export interface StrippedTree {
	/** Root of the copy. Mirrors the source root's layout exactly. */
	root: string;
	/** The copy's path for a path in the source tree. */
	pathFor(sourcePath: string): string;
	/**
	 * Retakes the copy, into the same directory.
	 *
	 * In place, so that entrypoint paths resolved against `root` stay valid
	 * across a dev rebuild — a fresh temp directory each time would invalidate
	 * every one of them.
	 */
	refresh(): Promise<void>;
	/** Deletes the copy. */
	dispose(): Promise<void>;
}

export interface StripOptions {
	/** Class members to empty. Defaults to the server half of a component. */
	names?: string[];
	/** Prefixes marking free functions to delete outright. */
	prefixes?: string[];
	/**
	 * JSX runtime for the copies, as a `@jsxImportSource` pragma.
	 *
	 * Required for a tree containing JSX. `compilerOptions` come from the config
	 * Deno resolved for the program, and a copy in a temp directory is outside
	 * it — without the pragma every `.tsx` in the mirror compiles against the
	 * *default* runtime and the bundle comes out full of `React.createElement`,
	 * which is undefined in the browser it is sent to.
	 */
	jsxImportSource?: string;
}

/** Members that exist only to serve a render, and must not reach a browser. */
const DEFAULT_NAMES = ["serverInit", "stylesheet"];

function isScript(path: string): boolean {
	return SCRIPT_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Every import specifier in `src`, as `[start, end]` ranges over the specifier
 * text itself.
 *
 * Matched against the code mask at the *keyword*, not at the specifier — the
 * specifier is inside a string by definition, so the mask would always reject
 * it. This is what keeps the word `from` inside a comment or a template literal
 * from being read as an import.
 */
function specifierRanges(src: string): Array<[number, number]> {
	const mask = scanMask(src);
	const pattern =
		/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bexport\s*\*\s*from\s*)(["'])([^"'\n]*)\1/g;
	const ranges: Array<[number, number]> = [];
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(src)) !== null) {
		if (mask[match.index]) continue;
		const quote = match.index + match[0].indexOf(match[1]);
		ranges.push([quote + 1, quote + 1 + match[2].length]);
	}
	return ranges;
}

/** Resolves `specifier` against `fromFile`, or `null` if it is not relative. */
function resolveRelative(specifier: string, fromFile: string): string | null {
	if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
	return new URL(specifier, `file://${fromFile}`).pathname;
}

/**
 * Points imports that leave the tree back at the originals.
 *
 * Everything else is left exactly as written: a specifier inside the tree
 * resolves to the copy beside it, and a bare, `jsr:` or aliased specifier
 * resolves through the program's import map, which is the same wherever the
 * importing file sits.
 */
function rewriteEscapingImports(src: string, sourceFile: string, sourceRoot: string): string {
	const edits: Array<[number, number, string]> = [];

	for (const [start, end] of specifierRanges(src)) {
		const specifier = src.slice(start, end);
		const resolved = resolveRelative(specifier, sourceFile);
		if (resolved === null) continue;
		if (resolved.startsWith(sourceRoot + "/")) continue;
		edits.push([start, end, `file://${resolved}`]);
	}

	let result = src;
	for (const [start, end, text] of edits.reverse()) {
		result = result.slice(0, start) + text + result.slice(end);
	}
	return result;
}

/**
 * Mirrors `sourceRoot` into a temporary directory, stripped.
 *
 * Every file is copied, not only the ones that changed: a relative import
 * between two files in the tree has to land on the copy, and it only does if
 * the copy is there.
 */
export async function mirrorStripped(
	sourceRoot: string,
	options: StripOptions = {},
): Promise<StrippedTree> {
	const root = await Deno.realPath(sourceRoot);
	const target = await Deno.makeTempDir({ prefix: "bearmetal-strip-" });
	const names = options.names ?? DEFAULT_NAMES;
	const pragma = options.jsxImportSource
		? `/** @jsxRuntime automatic */\n/** @jsxImportSource ${options.jsxImportSource} */\n`
		: "";

	async function mirror(): Promise<void> {
		for await (const entry of walkDir(root)) {
			const path = await Deno.realPath(entry.path);
			if (!(await Deno.stat(path)).isFile) continue;

			const relative = path.slice(root.length).replace(/^\//, "");
			const out = `${target}/${relative}`;
			await Deno.mkdir(directoryOf(out), { recursive: true });

			if (!isScript(path)) {
				await Deno.copyFile(path, out);
				continue;
			}

			const source = await Deno.readTextFile(path);
			const stripped = stripServerCode(source, { names, prefixes: options.prefixes });
			const rewritten = rewriteEscapingImports(stripped, path, root);
			const needsPragma = JSX_EXTENSIONS.some((ext) => path.endsWith(ext));
			await Deno.writeTextFile(out, needsPragma ? pragma + rewritten : rewritten);
		}
	}

	await mirror();

	return {
		root: target,
		async refresh() {
			// Emptied rather than rewritten over, so a component that has been
			// deleted since the last build does not linger in the copy and go on
			// being bundled.
			await Deno.remove(target, { recursive: true });
			await Deno.mkdir(target, { recursive: true });
			await mirror();
		},
		pathFor(sourcePath: string): string {
			const relative = sourcePath.startsWith(root)
				? sourcePath.slice(root.length).replace(/^\//, "")
				: sourcePath;
			return `${target}/${relative}`;
		},
		dispose: () => Deno.remove(target, { recursive: true }),
	};
}
