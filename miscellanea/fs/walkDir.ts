import { joinPath } from "@bearmetal/miscellanea";

export interface WalkEntry extends Deno.DirEntry {
  path: string;
}

export async function* walkDir(
  dir: string,
): AsyncGenerator<WalkEntry> {
  for await (const entry of Deno.readDir(dir)) {
    const path = joinPath(dir, entry.name);
    yield { ...entry, path };
    if (entry.isDirectory) yield* walkDir(path);
  }
}
