/**
 * @module
 * Turning a rendered `Response` into a file on disk.
 *
 * Shared by the build-time generator and the write-through module, so it takes
 * a URL and options rather than reaching into a build context.
 */

import { ensureDirOf } from "@bearmetal/miscellanea/fs";
import { joinPath } from "@bearmetal/miscellanea";
import type { OutputStyle, WriteOptions } from "./types.ts";

/**
 * Extension for a content type, inverting `getContentTypeByExtension` in
 * `router/util/contentType.ts`. Only types the router itself can produce are
 * worth listing; anything else keeps whatever extension its URL already had.
 */
const EXTENSIONS: Record<string, string> = {
	"text/html": "html",
	"text/css": "css",
	"text/javascript": "js",
	"application/javascript": "js",
	"application/json": "json",
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/svg+xml": "svg",
	"text/plain": "txt",
	"application/xml": "xml",
	"text/xml": "xml",
};

/** The bare type, with any `; charset=...` stripped. */
export function normalizeContentType(contentType: string | null): string {
	return (contentType ?? "").split(";")[0].trim().toLowerCase();
}

/** True for a response that should be written as a page rather than an asset. */
export function isHtml(contentType: string | null): boolean {
	return normalizeContentType(contentType) === "text/html";
}

/** True for a response whose body is a JS module - worth scanning for further imports. */
export function isScript(contentType: string | null): boolean {
	const type = normalizeContentType(contentType);
	return type === "text/javascript" || type === "application/javascript";
}

export function extensionFor(contentType: string | null): string | undefined {
	return EXTENSIONS[normalizeContentType(contentType)];
}

/** Percent-decode a path, leaving malformed sequences alone rather than throwing. */
function decodePath(pathname: string): string {
	try {
		return decodeURIComponent(pathname);
	} catch {
		return pathname;
	}
}

/**
 * A short, stable digest of a string. FNV-1a over UTF-16 units, truncated.
 *
 * Nothing here is a security property - the digest only has to be the same on
 * every build for the same input, and different for a different one.
 */
function digest(input: string): string {
	const mask = 0xffffffffffffffffn;
	let hash = 0xcbf29ce484222325n;
	for (let i = 0; i < input.length; i++) {
		hash = ((hash ^ BigInt(input.charCodeAt(i))) * 0x100000001b3n) & mask;
	}
	return hash.toString(16).padStart(16, "0").slice(0, 10);
}

/** Insert `.tag` into a path's last segment, ahead of any extension. */
function tagged(path: string, tag: string): string {
	const cut = path.lastIndexOf("/");
	const dir = cut === -1 ? "" : path.slice(0, cut + 1);
	const name = path.slice(cut + 1);
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? `${dir}${name}.${tag}` : `${dir}${name.slice(0, dot)}.${tag}${name.slice(dot)}`;
}

/**
 * The distinguishing part of a file name for a URL rendered with a query.
 *
 * A parameterised asset - the SVG a generator draws from its query, a search
 * page - is a different document per query, and a file system has nowhere to
 * put the `?`. So the query becomes a digest in the name: `/badge.svg?label=a`
 * lands at `badge.<digest>.svg`, one file per query, stable across builds. The
 * generator rewrites the references that pointed at the query form.
 *
 * The digest is taken over the query exactly as written rather than a
 * normalised one, so a generator that cares about parameter order still gets a
 * file per order.
 */
export function queryTag(search: string): string {
	const query = search.startsWith("?") ? search.slice(1) : search;
	return query === "" ? "" : digest(query);
}

/**
 * The file path a URL maps to, relative to the output directory.
 *
 * HTML gets the `outputStyle` treatment - `"index"` turns `/about` into
 * `about/index.html` so clean URLs work on any static host without rewrite
 * rules, `"flat"` turns it into `about.html`. Everything else keeps its URL
 * path, because assets already carry a meaningful extension.
 *
 * A query string is part of the identity of what was rendered, so it is part
 * of the name too - see {@linkcode queryTag}. Pass it on: this takes a path
 * that may still carry its `?query`, not a bare pathname.
 */
export function outputPathFor(
	pathname: string,
	contentType: string | null,
	outputStyle: OutputStyle = "index",
): string {
	const cut = pathname.indexOf("?");
	const tag = cut === -1 ? "" : queryTag(pathname.slice(cut + 1));
	const path = cut === -1 ? pathname : pathname.slice(0, cut);
	const clean = decodePath(path).replace(/^\/+/, "").replace(/\/+$/, "");
	const withTag = (p: string) => tag ? tagged(p, tag) : p;

	if (!isHtml(contentType)) {
		if (clean === "" && !tag) return "index";
		const base = clean === "" ? "index" : clean;
		const ext = extensionFor(contentType);
		const named = ext && !/\.[A-Za-z0-9]+$/.test(base) ? `${base}.${ext}` : base;
		return withTag(named);
	}

	if (clean === "") return tag ? joinPath(`index.${tag}`, "index.html") : "index.html";
	if (/\.html?$/i.test(clean)) return withTag(clean);
	return outputStyle === "flat" ? `${withTag(clean)}.html` : joinPath(withTag(clean), "index.html");
}

/**
 * The URL a static host serves a written file at.
 *
 * The inverse of {@linkcode outputPathFor} as far as a reference cares: a page
 * written to `about/index.html` is linked as `/about/`, an asset as its own
 * path. Used to point a rewritten reference at where the file actually landed.
 */
export function hrefFor(file: string): string {
	const path = file.replace(/^\/+/, "");
	if (path === "index.html") return "/";
	return path.endsWith("/index.html") ? `/${path.slice(0, -"index.html".length)}` : `/${path}`;
}

/** Reject a path that would escape the output directory. */
function assertContained(outDir: string, target: string): void {
	const root = resolvePath(outDir);
	const full = resolvePath(target);
	if (full !== root && !full.startsWith(root.endsWith("/") ? root : `${root}/`)) {
		throw new Error(`refusing to write outside outDir: ${target}`);
	}
}

function resolvePath(p: string): string {
	return new URL(p, `file://${Deno.cwd()}/`).pathname.replace(/\/+$/, "");
}

/**
 * Write a response body into `outDir`.
 *
 * The caller is responsible for handing over a response whose body it does not
 * also need - `Response` bodies are single-use streams, so pass a `clone()` when
 * the original still has to be served.
 *
 * @returns the path written, relative to `outDir`.
 */
export async function writeResponse(
	res: Response,
	url: URL,
	opts: WriteOptions,
): Promise<{ file: string; bytes: number }> {
	const relative = opts.out ??
		outputPathFor(
			url.pathname + url.search,
			res.headers.get("content-type"),
			opts.outputStyle,
		);

	const target = joinPath(opts.outDir, relative);
	assertContained(opts.outDir, target);

	const bytes = new Uint8Array(await res.arrayBuffer());
	await ensureDirOf(target);
	await Deno.writeFile(target, bytes);
	return { file: relative, bytes: bytes.byteLength };
}

/**
 * A standalone page that bounces the browser to `location`.
 *
 * Static hosts have no redirect table, so a 3xx from the router has to become
 * something a plain file server can serve. Both the meta refresh and the link
 * are needed: the first covers browsers, the second covers readers that do not
 * follow it.
 */
export function redirectShim(location: string): string {
	const escaped = location
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
	return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta http-equiv="refresh" content="0; url=${escaped}">
		<link rel="canonical" href="${escaped}">
		<title>Redirecting</title>
	</head>
	<body>
		<p>Redirecting to <a href="${escaped}">${escaped}</a>.</p>
	</body>
</html>
`;
}
