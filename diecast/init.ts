/**
 * @module
 * Scaffolds the two files a project needs to run diecast.
 *
 * ```sh
 * deno run -RW jsr:@bearmetal/diecast/init
 * ```
 */

import { joinPath } from "@bearmetal/miscellanea";

const ENTRY = `import { defineSite, runDiecast } from "@bearmetal/diecast";
import { router } from "./app.ts";
import manifest from "./diecast.manifest.ts";

export const site = defineSite({
	router,
	manifest,
	outDir: "dist",
});

if (import.meta.main) await runDiecast(site);
`;

const MANIFEST = `import { defineManifest } from "@bearmetal/diecast/manifest";

/**
 * Pages for routes that take parameters. Run \`deno task diecast suggest\` to
 * see which routes need an entry here, and to scaffold one for each.
 */
export default defineManifest({});
`;

/** Write `diecast.ts` and `diecast.manifest.ts` into `dir`, skipping any that exist. */
export async function init(dir = "."): Promise<string[]> {
	const files: [string, string][] = [
		["diecast.ts", ENTRY],
		["diecast.manifest.ts", MANIFEST],
	];

	const written: string[] = [];
	for (const [name, contents] of files) {
		const path = joinPath(dir, name);
		try {
			await Deno.writeTextFile(path, contents, { createNew: true });
			written.push(name);
		} catch (error) {
			if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
			console.log(`skipped ${name} (already exists)`);
		}
	}
	return written;
}

if (import.meta.main) {
	const written = await init(Deno.args[0] ?? ".");
	for (const name of written) console.log(`created ${name}`);
	console.log(
		`\nAdd a task to deno.json:\n  "diecast": "deno run -A diecast.ts"\n\n` +
			`Then: deno task diecast suggest`,
	);
}
