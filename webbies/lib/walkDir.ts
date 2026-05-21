import { joinPath } from "./joinPath.ts";

export async function* walkDir(
	dir: string,
): AsyncGenerator<Deno.DirEntry & { path: string }> {
	for await (const entry of Deno.readDir(dir)) {
		const path = joinPath(dir, entry.name);
		yield { ...entry, path };
		if (entry.isDirectory) yield* await walkDir(path);
	}
}
