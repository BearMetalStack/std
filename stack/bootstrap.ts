import { CollectionMap, joinPath } from "@bearmetal/miscellanea";
import type { flags } from "./flags.ts";
import { denoJson, loadTemplateFiles, processFlagPartials } from "./template.ts";

export async function bootstrap(opts: {
	flags: flags;
	projectName: string;
	dirname?: string;
	dryRun?: boolean;
}) {
	const { flags, projectName, dryRun = false } = opts;
	const projectDir = `./${opts.dirname ?? projectName}`;

	try {
		if (!dryRun) {
			const stat = await Deno.stat(projectDir);
			if (!stat.isDirectory) {
				console.log(`❌ ${projectDir} already exists and is not a directory`);
				return;
			}
			const contents = await Array.fromAsync(Deno.readDir(projectDir));
			if (contents.length > 0) {
				console.log(`❌ ${projectDir} is not empty`);
				return;
			}
		}
	} catch { /* */ }

	await Deno.mkdir(projectDir, { recursive: true });

	const basePackages = [
		"@bearmetal/app",
		"@bearmetal/drip",
		"@bearmetal/jsx",
		"@bearmetal/miscellanea",
		"@bearmetal/router",
		"@bearmetal/stack",
	];
	const optionalPackages: [keyof flags, string][] = [
		["devProxy", "@bearmetal/devproxy"],
		["db", "@bearmetal/db"],
	];

	const toInstall = new Set<string>(basePackages);
	for (const [flag, pack] of optionalPackages) {
		if (flags[flag]) toInstall.add(pack);
	}

	await writeFile(joinPath(projectDir, "deno.json"), denoJson(projectName, toInstall), dryRun);
	const partials = new CollectionMap<string, string>();
	const ropts = processFlagPartials(flags, partials);
	await loadTemplateFiles(projectDir, partials, ropts);
}

async function writeFile(path: string, content: string, dryRun: boolean) {
	console.log(`   writing ${path}...`);
	if (!dryRun) {
		await Deno.mkdir(path.split("/").slice(0, -1).join("/"), { recursive: true });
		await Deno.writeTextFile(path, content);
	}
}
