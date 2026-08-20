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
 * The file path a URL maps to, relative to the output directory.
 *
 * HTML gets the `outputStyle` treatment - `"index"` turns `/about` into
 * `about/index.html` so clean URLs work on any static host without rewrite
 * rules, `"flat"` turns it into `about.html`. Everything else keeps its URL
 * path, because assets already carry a meaningful extension.
 */
export function outputPathFor(
	pathname: string,
	contentType: string | null,
	outputStyle: OutputStyle = "index",
): string {
	const clean = decodePath(pathname).replace(/^\/+/, "").replace(/\/+$/, "");

	if (!isHtml(contentType)) {
		if (clean === "") return "index";
		const ext = extensionFor(contentType);
		return ext && !/\.[A-Za-z0-9]+$/.test(clean) ? `${clean}.${ext}` : clean;
	}

	if (clean === "") return "index.html";
	if (/\.html?$/i.test(clean)) return clean;
	return outputStyle === "flat" ? `${clean}.html` : joinPath(clean, "index.html");
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
		outputPathFor(url.pathname, res.headers.get("content-type"), opts.outputStyle);

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
