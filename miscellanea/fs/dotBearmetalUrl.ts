import type { DotBearmetalDirUrl, DotBearmetalFileUrl, DotBearmetalNamespace } from "@types";

/**
 * URL-based counterparts to the `dotBearmetal*` utilities, for code that runs
 * inside a compiled binary (`deno compile --include .bearmetal`).
 *
 * In a compiled binary the embedded file system is rooted at a virtual
 * `deno-compile-<name>` directory and `Deno.cwd()` points at the *real*
 * file system, so the cwd-walking path variant can never find an embedded
 * `.bearmetal`. These variants anchor on a module URL (`import.meta.url`)
 * instead and resolve everything as `file:` URLs.
 *
 * The embedded file system is read-only, so unlike the path variants there
 * are no write helpers and nothing is created when missing.
 */

async function isDir(url: URL): Promise<boolean> {
	try {
		return (await Deno.stat(url)).isDirectory;
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

function lastSegment(dir: URL): string {
	return decodeURIComponent(dir.pathname.split("/").filter(Boolean).pop() ?? "");
}

// Find an existing .bearmetal dir by walking up from the given module URL.
// At each ancestor, check for .bearmetal directly; where the layout says the
// data can only live in a *sibling* branch — the ancestor is the compile-time
// virtual root, or we just walked up out of the `bearmetal` package dir —
// also check the ancestor's immediate subdirectories. The scan is gated like
// that so a run from source can't wander into an unrelated project's
// .bearmetal two branches away.
async function findDotBearmetalUrl(base: string | URL): Promise<URL | null> {
	let dir = new URL(".", base);
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

/**
 * Resolve a namespace directory inside `.bearmetal` as a `file:` URL,
 * anchored on `base` (pass `import.meta.url`). Throws if no `.bearmetal`
 * directory is reachable — in a compiled binary that means it wasn't
 * embedded with `--include .bearmetal`.
 */
export async function dotBearmetalUrl(
	base: string | URL,
	namespace: DotBearmetalNamespace,
): Promise<URL> {
	const found = await findDotBearmetalUrl(base);
	if (!found) {
		throw new Error(
			`No .bearmetal directory found from ${base.toString()} — ` +
				"in a compiled binary, embed it with `deno compile --include .bearmetal`",
		);
	}
	return childDir(found, ...(Array.isArray(namespace) ? namespace : [namespace]));
}

/** Read-only accessor for a file in a `.bearmetal` namespace, resolved as a `file:` URL. */
// deno-lint-ignore ban-types
export async function dotBearmetalFileUrl<T = {}>(
	base: string | URL,
	namespace: DotBearmetalNamespace,
	fileName: string,
): Promise<DotBearmetalFileUrl<T>> {
	const dir = await dotBearmetalUrl(base, namespace);
	const url = new URL(childDir(dir, fileName).href.replace(/\/$/, ""));
	return {
		url,
		async read() {
			try {
				return await Deno.readTextFile(url);
			} catch {
				return undefined;
			}
		},
		async readJson<J = T>(): Promise<J> {
			try {
				return JSON.parse(await Deno.readTextFile(url));
			} catch {
				return {} as J;
			}
		},
	};
}

/** Read-only accessor for a `.bearmetal` namespace directory, resolved as a `file:` URL. */
export async function dotBearmetalDirUrl(
	base: string | URL,
	namespace: DotBearmetalNamespace,
): Promise<DotBearmetalDirUrl> {
	const url = await dotBearmetalUrl(base, namespace);
	return {
		url,
		read: async () => {
			try {
				return await Array.fromAsync(Deno.readDir(url));
			} catch {
				return undefined;
			}
		},
	};
}
