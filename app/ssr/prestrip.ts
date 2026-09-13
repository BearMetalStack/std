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
	 * every one of them. Only a copy whose content changed is rewritten, and only
	 * a copy whose source is gone is deleted, so a watcher on `root` sees exactly
	 * the files that changed. Files placed in `root` by anything else are left
	 * alone.
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
	/**
	 * Local import-map aliases (e.g. `@app/`), already absolutized to `file://`
	 * URLs, rewritten inline wherever a mirrored file imports one.
	 *
	 * A `jsr:`/`npm:` specifier resolves the same everywhere, through the
	 * global cache — but a local path alias resolves through the program's
	 * own `deno.json`, which the mirror is nowhere near. Without this, a
	 * mirrored file importing a local alias fails to bundle.
	 */
	imports?: Record<string, string>;
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
 * `to` as a specifier relative to the file `from`.
 *
 * An alias that names a file inside the tree is made relative rather than
 * absolute, so it lands on the stripped copy and not on the original.
 */
function relativeSpecifier(from: string, to: string): string {
	const fromParts = directoryOf(from).split("/");
	const toParts = to.split("/");
	let shared = 0;
	while (shared < fromParts.length && fromParts[shared] === toParts[shared]) shared++;
	const up = fromParts.length - shared;
	const rest = toParts.slice(shared).join("/");
	return up === 0 ? `./${rest}` : `${"../".repeat(up)}${rest}`;
}

/**
 * Points imports that leave the tree back at the originals.
 *
 * A specifier inside the tree resolves to the copy beside it, and a bare
 * `jsr:` specifier resolves through the program's import map the same
 * wherever the importing file sits, since that's a single global lookup.
 * `imports` covers the third case — a *local* path alias (`@app/`, ...) —
 * which does not: `compilerOptions`/`imports` come from whatever `deno.json`
 * is nearest the *program*, not nearest the file being resolved, and the
 * mirror is nowhere near it. Rewriting the specifier text itself is what
 * makes the same fix that already applies to relative imports apply here
 * too, since a config file placed in the mirror is never consulted (the same
 * reason the JSX pragma below exists rather than a `compilerOptions` copy).
 * An alias that names a file inside the tree is made relative instead, so it
 * reaches the stripped copy rather than the original.
 */
function rewriteEscapingImports(
	src: string,
	sourceFile: string,
	sourceRoot: string,
	imports: Record<string, string> = {},
): string {
	const edits: Array<[number, number, string]> = [];
	const aliases = Object.entries(imports).sort(([a], [b]) => b.length - a.length);

	for (const [start, end] of specifierRanges(src)) {
		const specifier = src.slice(start, end);

		const resolved = resolveRelative(specifier, sourceFile);
		if (resolved !== null) {
			if (resolved.startsWith(sourceRoot + "/")) continue;
			edits.push([start, end, `file://${resolved}`]);
			continue;
		}

		const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
		if (!alias) continue;
		const target = alias[1] + specifier.slice(alias[0].length);
		const targetPath = target.startsWith("file://")
			? decodeURIComponent(new URL(target).pathname)
			: null;
		edits.push([
			start,
			end,
			targetPath?.startsWith(sourceRoot + "/") ? relativeSpecifier(sourceFile, targetPath) : target,
		]);
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

	const written = new Set<string>();

	async function write(out: string, content: string | Uint8Array): Promise<void> {
		written.add(out);
		const current = await Deno.readFile(out).catch(() => null);
		const next = typeof content === "string" ? new TextEncoder().encode(content) : content;
		if (current && current.length === next.length && current.every((b, i) => b === next[i])) {
			return;
		}
		await Deno.writeFile(out, next);
	}

	async function mirror(): Promise<void> {
		const previous = new Set(written);
		written.clear();
		for await (const entry of walkDir(root)) {
			const path = await Deno.realPath(entry.path);
			if (!(await Deno.stat(path)).isFile) continue;

			const relative = path.slice(root.length).replace(/^\//, "");
			const out = `${target}/${relative}`;
			await Deno.mkdir(directoryOf(out), { recursive: true });

			if (!isScript(path)) {
				await write(out, await Deno.readFile(path));
				continue;
			}

			const source = await Deno.readTextFile(path);
			const stripped = stripServerCode(source, { names, prefixes: options.prefixes });
			const rewritten = rewriteEscapingImports(stripped, path, root, options.imports);
			const needsPragma = JSX_EXTENSIONS.some((ext) => path.endsWith(ext));
			await write(out, needsPragma ? pragma + rewritten : rewritten);
		}
		for (const out of previous) {
			if (!written.has(out)) await Deno.remove(out).catch(() => {});
		}
	}

	await mirror();

	return {
		root: target,
		refresh: mirror,
		pathFor(sourcePath: string): string {
			const relative = sourcePath.startsWith(root)
				? sourcePath.slice(root.length).replace(/^\//, "")
				: sourcePath;
			return `${target}/${relative}`;
		},
		dispose: () => Deno.remove(target, { recursive: true }),
	};
}
