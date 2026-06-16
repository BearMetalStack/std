import { expandGlob } from "@std/fs/expand-glob";
import { joinPath } from "@bearmetal/miscellanea";
import { walkDir } from "@bearmetal/miscellanea/fs";

type ScopeString = `@${string}`;

async function moduleInternalDeps(
	scope: ScopeString,
	path: string,
): Promise<string[]> {
	const rx = RegExp(`^import[\\s\\S]*?(?<dep>${scope}\/.*?)["']`, "gm");
	const module = await Deno.readTextFile(path);
	const set = new Set<string>();
	let match: RegExpExecArray | null;
	while ((match = rx.exec(module)) !== null) {
		match.groups && set.add(match.groups?.dep);
	}

	return Array.from(set);
}

const ignorable = ["test.ts", "temp.ts", "example.ts"];
const pathIgnerableRx = /example|temp|\.git/;
async function packageInternalDeps(
	scope: ScopeString,
	pack: string,
): Promise<[string, string[]]> {
	const set = new Set<string>();
	const path = joinPath(Deno.cwd(), pack);
	for await (const entry of walkDir(path)) {
		if (
			!ignorable.includes(entry.name) && !pathIgnerableRx.test(entry.path) &&
			(entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
		) {
			(await moduleInternalDeps(scope, entry.path)).map((e) =>
				set.add(e.split("/").slice(0, 2).join("/"))
			);
		}
	}
	const packName = `${scope}/${pack}`;
	return [packName, Array.from(set).filter((d) => d !== packName)];
}

export async function isPackage(path: string, scope: ScopeString): Promise<boolean> {
	try {
		const conf = JSON.parse(
			await Deno.readTextFile(joinPath(path, "deno.json")),
		) as { name: string | undefined };
		if (!conf.name || !conf.name?.startsWith(scope)) return false;
	} catch {
		return false;
	}
	return true;
}

export async function buildDependencyGraph(
	internalScope: ScopeString,
): Promise<Record<string, string[]>> {
	const conf = JSON.parse(await Deno.readTextFile("./deno.json") ?? "");
	const { workspace = [] } = conf;
	const promisedLands: Promise<[string, string[]]>[] = [];
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
			promisedLands.push(packageInternalDeps(internalScope, entry.name));
		}
	}
	return (await Promise.all(promisedLands)).reduce(
		(acc, curr) => ({ ...acc, [curr[0]]: curr[1] }),
		{},
	);
}

if (import.meta.main) {
	console.log(await buildDependencyGraph("@bearmetal"));
}
