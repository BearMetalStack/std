import { joinPath } from "@bearmetal/miscellanea";

/** A directory entry augmented with its full resolved `path`. */
export interface WalkEntry extends Deno.DirEntry {
	path: string;
}

/** Recursively yields every entry under `dir`, depth-first. */
export async function* walkDir(
	dir: string,
): AsyncGenerator<WalkEntry> {
	for await (const entry of Deno.readDir(dir)) {
		const path = joinPath(dir, entry.name);
		yield { ...entry, path };
		if (entry.isDirectory) yield* walkDir(path);
	}
}
