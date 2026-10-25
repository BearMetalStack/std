import { dirname, join } from "@std/path";

/** Writes `files` (path → contents) under a fresh temporary directory and returns it. */
export async function fixture(files: Record<string, string>): Promise<string> {
	const root = await Deno.makeTempDir({ prefix: "gutenbearg-" });
	for (const [path, text] of Object.entries(files)) {
		await Deno.mkdir(dirname(join(root, path)), { recursive: true });
		await Deno.writeTextFile(join(root, path), text);
	}
	return root;
}
