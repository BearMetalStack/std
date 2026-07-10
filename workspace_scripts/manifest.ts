/** Lists every workspace package at its current version. */

import { parseArgs } from "@std/cli/parse-args";
import { discoverPackages } from "./workspace.ts";

if (import.meta.main) {
	const flags = parseArgs(Deno.args, { boolean: ["json"] });
	const packages = await discoverPackages();

	if (flags.json) {
		console.log(JSON.stringify(
			packages.map(({ name, version, dir, publishable }) => ({
				name,
				version,
				dir,
				publishable,
			})),
			null,
			"\t",
		));
	} else {
		for (const { name, version, publishable } of packages) {
			console.log(`${name}@${version}${publishable ? "" : "  (unpublished)"}`);
		}
	}
}
