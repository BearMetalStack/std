import { joinPath } from "@bearmetal/miscellanea";
import { getContentTypeByExtension } from "./contentType.ts";
import { NotFound } from "./response.ts";

export async function fileResponse(path: string): Promise<Response> {
	const file = await Deno.readFile(path);
	const ext = path.split(".").at(-1);
	return new Response(file, {
		headers: {
			"Content-Type": getContentTypeByExtension(ext),
			"Cache-control": "max-age=604800; public",
		},
	});
}

export async function resolveStaticFile(
	dir: string,
	root: string,
	pathname: string,
	spa: boolean,
	showIndex: boolean,
): Promise<Response> {
	const normalizedPath = (dir + "/" + pathname.replace(new RegExp("^" + root), ""))
		.trim()
		.replace("//", "/")
		.replace(/\/\s?$/, "");

	const served = await tryServeFile(normalizedPath, spa, showIndex);
	if (served) return served;

	if (spa) {
		// Hashed assets referenced relative to index.html get requested from
		// whatever SPA route the browser is on (/some/route/chunk-XYZ.js) -
		// retry against the dist root before falling back to the app shell.
		const flattened = joinPath(dir, pathname.split("/").pop()!);
		if (flattened !== normalizedPath) {
			const asset = await tryServeFile(flattened, spa, showIndex);
			if (asset) return asset;
		}
		try {
			return await fileResponse(dir + "/index.html");
		} catch (e) {
			if (e instanceof Deno.errors.NotFound) return NotFound();
			throw e;
		}
	}

	return NotFound();
}

/** Serves the file (or its directory index) at `path`, or null if it doesn't resolve to one. */
async function tryServeFile(
	path: string,
	spa: boolean,
	showIndex: boolean,
): Promise<Response | null> {
	let resolved = path;
	try {
		const fileInfo = await Deno.stat(resolved);
		if (fileInfo.isDirectory) {
			if (!showIndex && !spa) return NotFound();
			resolved += "/index.html";
		}
		return await fileResponse(resolved);
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return null;
		throw error;
	}
}
