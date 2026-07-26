import { getContentTypeByExtension } from "./contentType.ts";
import { NotFound } from "./response.ts";

/**
 * Normalizes a directory argument into a `file:` URL ending in `/`.
 *
 * A `URL` is used as-is, which is what lets a directory live outside the
 * process cwd - e.g. `new URL("./public/", import.meta.url)` keeps resolving
 * against the module graph, so the files stay reachable from a `deno compile`
 * binary that embedded them.
 *
 * A `string` is resolved against the cwd for backwards compatibility, so
 * `"./public"`, `"public"` and `"/srv/public"` all mean what they used to.
 *
 * The trailing slash matters: without it `new URL("app.js", dir)` would
 * resolve as a sibling of the directory rather than a child of it.
 */
export function toDirectoryUrl(dir: string | URL): URL {
	const url = dir instanceof URL ? new URL(dir.href) : new URL(dir, cwdUrl());
	if (!url.pathname.endsWith("/")) url.pathname += "/";
	return url;
}

/** `file:` URL for the process cwd, with the trailing slash `new URL()` needs as a base. */
function cwdUrl(): URL {
	// Backslashes keep Windows drive paths (`C:\src`) from being read as escapes.
	const cwd = Deno.cwd().replaceAll("\\", "/");
	return new URL(`file://${cwd.startsWith("/") ? "" : "/"}${cwd}/`);
}

/**
 * Resolves a relative subpath under `dir`, or null if it escapes the directory.
 *
 * `new URL()` collapses `..` before the filesystem is ever touched, so without
 * this check a request for `/static/../../etc/passwd` would resolve to a real
 * path outside the served directory. The URL parser also folds every encoded
 * spelling of a dot segment (`%2e%2e`, `.%2e`, ...) into the same `..`, so
 * comparing the resolved href is enough - there is no encoding left to smuggle
 * one through. The trailing slash on `dir` is load-bearing: it stops
 * `/srv/public-secrets` from passing as a child of `/srv/public`.
 *
 * This bounds the path, not the inode - a symlink inside `dir` pointing out of
 * it is still followed, same as before.
 */
function childUrl(dir: URL, subPath: string): URL | null {
	const url = new URL(subPath.replace(/^\/+/, "").replace(/\/+\s*$/, ""), dir);
	return url.href.startsWith(dir.href) ? url : null;
}

export async function fileResponse(path: string | URL): Promise<Response> {
	const file = await Deno.readFile(path);
	const ext = (path instanceof URL ? path.pathname : path).split(".").at(-1);
	return new Response(file, {
		headers: {
			"Content-Type": getContentTypeByExtension(ext),
			"Cache-control": "max-age=604800; public",
		},
	});
}

export async function resolveStaticFile(
	dir: string | URL,
	root: string,
	pathname: string,
	spa: boolean,
	showIndex: boolean,
): Promise<Response> {
	const dirUrl = toDirectoryUrl(dir);
	const relative = pathname.replace(new RegExp("^" + root), "").trim();
	const target = childUrl(dirUrl, relative);
	// A path that climbs out of the directory is never a real route, so it 404s
	// rather than falling through to the SPA shell.
	if (!target) return NotFound();

	const served = await tryServeFile(target, spa, showIndex);
	if (served) return served;

	if (spa) {
		// Hashed assets referenced relative to index.html get requested from
		// whatever SPA route the browser is on (/some/route/chunk-XYZ.js) -
		// retry against the dist root before falling back to the app shell.
		const flattened = childUrl(dirUrl, pathname.split("/").pop()!);
		if (flattened && flattened.href !== target.href) {
			const asset = await tryServeFile(flattened, spa, showIndex);
			if (asset) return asset;
		}
		try {
			return await fileResponse(new URL("index.html", dirUrl));
		} catch (e) {
			if (e instanceof Deno.errors.NotFound) return NotFound();
			throw e;
		}
	}

	return NotFound();
}

/** Serves the file (or its directory index) at `url`, or null if it doesn't resolve to one. */
async function tryServeFile(
	url: URL,
	spa: boolean,
	showIndex: boolean,
): Promise<Response | null> {
	let resolved = url;
	try {
		const fileInfo = await Deno.stat(resolved);
		if (fileInfo.isDirectory) {
			if (!showIndex && !spa) return NotFound();
			resolved = new URL(
				"index.html",
				resolved.pathname.endsWith("/") ? resolved : new URL(resolved.href + "/"),
			);
		}
		return await fileResponse(resolved);
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return null;
		throw error;
	}
}
