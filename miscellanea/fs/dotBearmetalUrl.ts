import { toFileUrl } from "@std/path";
import type {
	DotBearmetalDirUrl,
	DotBearmetalFileUrl,
	DotBearmetalNamespace,
	DotBearmetalUrlOptions,
} from "@types";

/**
 * Read-only, URL-based counterparts to the `dotBearmetal*` utilities, for code
 * that may run inside a compiled binary (`deno compile --include .bearmetal`).
 *
 * In a compiled binary the embedded file system is rooted at a virtual
 * `deno-compile-<name>` directory while `Deno.cwd()` still points at the real
 * file system, so the cwd-walking path utilities can never see an embedded
 * `.bearmetal`. These variants resolve a *list* of candidate roots and read
 * from the first that has what was asked for:
 *
 * 1. a real `.bearmetal` found by walking up from `Deno.cwd()` — the project's
 *    own directory, which keeps source-run behaviour unchanged and lets a
 *    project override what a binary was built with;
 * 2. the embedded file system, anchored on `base` (pass `import.meta.url`)
 *    when the calling module is itself part of the compiled file system;
 * 3. the embedded file system, anchored on `Deno.mainModule`, which is always
 *    a `file:` URL inside the virtual root — this is the anchor that works
 *    when the calling package was compiled in as a remote `jsr:`/`https:`
 *    dependency and so has a remote `import.meta.url` of its own.
 *
 * The embedded file system is read-only, so there are no write helpers here
 * and nothing is created when missing — use the path-based `dotBearmetal*`
 * utilities for anything that writes.
 */

async function isDir(url: URL): Promise<boolean> {
	try {
		return (await Deno.stat(url)).isDirectory;
	} catch {
		return false;
	}
}

async function isFile(url: URL): Promise<boolean> {
	try {
		return (await Deno.stat(url)).isFile;
	} catch {
		return false;
	}
}

// Append path segments to a directory URL, keeping the trailing slash so the
// result can anchor further relative resolution
function childDir(dir: URL, ...segments: string[]): URL {
	const rel = segments
		.flatMap((s) => s.split("/"))
		.filter(Boolean)
		.map(encodeURIComponent)
		.join("/");
	return new URL(rel + "/", dir);
}

function childFile(dir: URL, name: string): URL {
	return new URL(childDir(dir, name).href.replace(/\/$/, ""));
}

function lastSegment(dir: URL): string {
	return decodeURIComponent(dir.pathname.split("/").filter(Boolean).pop() ?? "");
}

function namespaceSegments(namespace: DotBearmetalNamespace): string[] {
	return Array.isArray(namespace) ? namespace : [namespace];
}

const VIRTUAL_ROOT = /(^|\/)deno-compile-[^/]*(\/|$)/;

/**
 * The entry module, but only when running inside a compiled binary. `deno
 * compile` roots the embedded file system at a virtual `deno-compile-<name>`
 * directory, and that prefix on the entry module is the only signal Deno
 * exposes for "am I compiled". Gating on it keeps the entry-module anchor from
 * discovering unrelated `.bearmetal` directories during ordinary source runs;
 * if the prefix ever changes we simply stop finding an embedded root, and an
 * explicit `base` still works.
 */
function compiledEntryModule(): string | null {
	try {
		const main = Deno.mainModule;
		const { protocol, pathname } = new URL(main);
		return protocol === "file:" && VIRTUAL_ROOT.test(pathname) ? main : null;
	} catch {
		return null;
	}
}

// Find an existing .bearmetal dir by walking up from a module URL.
//
// At each ancestor, check for .bearmetal directly. Where the layout says the
// data can only live in a *sibling* branch — the ancestor is the compile-time
// virtual root, or we just walked up out of the `bearmetal` package dir — also
// check that ancestor's immediate subdirectories, which is how a compiled
// binary lays out `bearmetal/` next to the directory holding `.bearmetal`. The
// sibling scan is gated so a run from source can't wander into an unrelated
// project's .bearmetal two branches away.
async function findDotBearmetalUrl(base: string | URL): Promise<URL | null> {
	let dir = new URL(".", base);
	if (dir.protocol !== "file:") return null; // remote module: not in any embedded fs
	let cameFrom = "";

	while (true) {
		const direct = childDir(dir, ".bearmetal");
		if (await isDir(direct)) return direct;

		if (cameFrom === "bearmetal" || lastSegment(dir).startsWith("deno-compile-")) {
			try {
				for await (const entry of Deno.readDir(dir)) {
					if (!entry.isDirectory || entry.name === cameFrom) continue;
					const nested = childDir(dir, entry.name, ".bearmetal");
					if (await isDir(nested)) return nested;
				}
			} catch { /* unreadable ancestor, keep walking */ }
		}

		const parent = new URL("..", dir);
		if (parent.href === dir.href) return null;
		cameFrom = lastSegment(dir);
		dir = parent;
	}
}

// Walk up from the real cwd. Unlike the path-based `dotBearmetal`, this never
// creates the directory — a missing .bearmetal is just "no such root".
async function findDotBearmetalFromCwd(): Promise<URL | null> {
	let cwd: URL;
	try {
		cwd = toFileUrl(Deno.cwd());
	} catch {
		return null; // no read permission for cwd, or no cwd at all
	}
	let dir = new URL(cwd.href.endsWith("/") ? cwd.href : cwd.href + "/");

	while (true) {
		const candidate = childDir(dir, ".bearmetal");
		if (await isDir(candidate)) return candidate;

		const parent = new URL("..", dir);
		if (parent.href === dir.href) return null;
		dir = parent;
	}
}

/**
 * Every `.bearmetal` root visible to the caller, most-specific first. Empty
 * when none is reachable — in a compiled binary that usually means it wasn't
 * embedded with `deno compile --include .bearmetal`.
 */
export async function dotBearmetalRoots(opts: DotBearmetalUrlOptions = {}): Promise<URL[]> {
	const { base, searchCwd = true } = opts;
	const roots: URL[] = [];
	const seen = new Set<string>();

	const push = (url: URL | null) => {
		if (url && !seen.has(url.href)) {
			seen.add(url.href);
			roots.push(url);
		}
	};

	if (searchCwd) push(await findDotBearmetalFromCwd());
	if (base) push(await findDotBearmetalUrl(base));
	// The entry module is a file: URL inside the virtual root of a compiled
	// binary even when the calling package came in as a remote dependency, so
	// it is the anchor that reaches the embedded fs when `base` cannot
	const entry = compiledEntryModule();
	if (entry) push(await findDotBearmetalUrl(entry));

	return roots;
}

/**
 * Resolve a namespace directory inside `.bearmetal` as a `file:` URL, using the
 * first root that actually has it, else the first root at all. `null` when no
 * `.bearmetal` root is reachable.
 */
export async function dotBearmetalUrl(
	namespace: DotBearmetalNamespace,
	opts: DotBearmetalUrlOptions = {},
): Promise<URL | null> {
	const roots = await dotBearmetalRoots(opts);
	if (roots.length === 0) return null;

	const segments = namespaceSegments(namespace);
	for (const root of roots) {
		const candidate = childDir(root, ...segments);
		if (await isDir(candidate)) return candidate;
	}
	return childDir(roots[0], ...segments);
}

/**
 * Read-only accessor for a file in a `.bearmetal` namespace, resolved as a
 * `file:` URL against the first root that actually contains it. Reads fail
 * soft: `read()` yields `undefined` and `readJson()` an empty object when the
 * file (or `.bearmetal` itself) is missing.
 */
// deno-lint-ignore ban-types
export async function dotBearmetalFileUrl<T = {}>(
	namespace: DotBearmetalNamespace,
	fileName: string,
	opts: DotBearmetalUrlOptions = {},
): Promise<DotBearmetalFileUrl<T>> {
	const roots = await dotBearmetalRoots(opts);
	const segments = namespaceSegments(namespace);

	let url: URL | null = null;
	for (const root of roots) {
		const candidate = childFile(childDir(root, ...segments), fileName);
		if (await isFile(candidate)) {
			url = candidate;
			break;
		}
		url ??= candidate; // remember the first location as the nominal one
	}

	return {
		url,
		async read() {
			if (!url) return undefined;
			try {
				return await Deno.readTextFile(url);
			} catch {
				return undefined;
			}
		},
		async readJson<J = T>(): Promise<J> {
			if (!url) return {} as J;
			try {
				return JSON.parse(await Deno.readTextFile(url));
			} catch {
				return {} as J;
			}
		},
	};
}

/**
 * Read-only accessor for a `.bearmetal` namespace directory, resolved as a
 * `file:` URL. `read()` yields `undefined` when the directory is missing.
 */
export async function dotBearmetalDirUrl(
	namespace: DotBearmetalNamespace,
	opts: DotBearmetalUrlOptions = {},
): Promise<DotBearmetalDirUrl> {
	const url = await dotBearmetalUrl(namespace, opts);
	return {
		url,
		read: async () => {
			if (!url) return undefined;
			try {
				return await Array.fromAsync(Deno.readDir(url));
			} catch {
				return undefined;
			}
		},
	};
}
