import { expandGlob } from "@std/fs/expand-glob";
import { isPackage } from "./dep_graph.ts";
import { joinPath } from "@bearmetal/miscellanea";
const pathIgnerableRx = /example|temp|\.git/;
type ScopeString = `@${string}`;

async function generateManifest(
	internalScope: ScopeString,
) {
	const conf = JSON.parse(await Deno.readTextFile("./deno.json") ?? "");
	const { workspace = [] } = conf;
	const promisedLands: Promise<[string, string]>[] = [];

	for (const ws of workspace) {
		for await (
			const entry of expandGlob(joinPath(Deno.cwd(), ws), {
				followSymlinks: false,
				includeDirs: true,
			})
		) {
			if (!entry.isDirectory) continue;
			if (!(await isPackage(entry.path, internalScope))) continue;
			if (pathIgnerableRx.test(entry.path)) continue;
			promisedLands.push(packageVersion(internalScope, entry.name));
		}
	}

	return Promise.all(promisedLands);
}
async function packageVersion(
	scope: ScopeString,
	pack: string,
): Promise<[string, string]> {
	const path = joinPath(Deno.cwd(), pack, "deno.json");
	const conf = JSON.parse(await Deno.readTextFile(path) ?? "");
	const { version } = conf;
	const packName = `${scope}/${pack}`;
	return [packName, version];
}

if (import.meta.main) {
	const packages = await generateManifest("@bearmetal");
	for (const [name, version] of packages) {
		console.log(`${name}@${version}`);
	}
}
