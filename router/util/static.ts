import { joinPath } from "@bearmetal/miscellanea";
import { getContentTypeByExtension } from "./contentType.ts";
import { NotFound } from "./response.ts";

export async function fileResponse(path: string): Promise<Response> {
  const file = await Deno.readFile(path);
  const ext = path.split(".").at(-1);
  return new Response(file, {
    headers: { "Content-Type": getContentTypeByExtension(ext) },
  });
}

export async function resolveStaticFile(
  dir: string,
  root: string,
  pathname: string,
  spa: boolean,
  showIndex: boolean,
): Promise<Response> {
  let normalizedPath = spa
    ? joinPath(dir, pathname.split("/").pop()!)
    : (dir + "/" + pathname.replace(new RegExp("^" + root), ""))
      .trim()
      .replace("//", "/")
      .replace(/\/\s?$/, "");

  let fileInfo: Deno.FileInfo;
  try {
    fileInfo = await Deno.stat(normalizedPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return spa ? fileResponse(dir + "/index.html") : NotFound();
    }
    throw error;
  }

  if (fileInfo.isDirectory) {
    if (!showIndex && !spa) return NotFound();
    normalizedPath += "/index.html";
  }

  try {
    return await fileResponse(normalizedPath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return spa ? fileResponse(dir + "/index.html") : NotFound();
    }
    throw e;
  }
}
