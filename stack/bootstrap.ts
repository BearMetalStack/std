import { CollectionMap, joinPath } from "@bearmetal/miscellanea";
import type { flags } from "./flags.ts";
import { denoJson, loadTemplateFiles, processFlagPartials } from "./template.ts";

export interface BootstrapOptions {
	flags: flags;
	projectName: string;
	/** Directory to create the app in, relative to the cwd. Defaults to the name. */
	dirname?: string;
	/** Report what would be written without writing anything. */
	dryRun?: boolean;
	/** Template to scaffold from. */
	template?: string;
}

export async function bootstrap(opts: BootstrapOptions): Promise<void> {
	const { flags, projectName, dryRun = false, template = "default" } = opts;
	const target = opts.dirname ?? projectName;
	// An absolute target is used as given; anything else is relative to the cwd.
	const projectDir = target.startsWith("/") ? target : `./${target}`;

	if (!dryRun) {
		if (!await isUsable(projectDir)) return;
		await Deno.mkdir(projectDir, { recursive: true });
	}

	const basePackages = [
		"@bearmetal/app",
		"@bearmetal/drip",
		"@bearmetal/jsx",
		"@bearmetal/miscellanea",
		"@bearmetal/router",
		"@bearmetal/stack",
	];
	// Every package the generated `main.ts` will import, per flag — `auth` brings
	// forge with it, because the auth partial declares its user schema with it.
	const optionalPackages: [keyof flags, string[]][] = [
		["devProxy", ["@bearmetal/devproxy"]],
		["db", ["@bearmetal/db"]],
		["auth", ["@bearmetal/auth", "@bearmetal/forge"]],
	];

	const toInstall = new Set<string>(basePackages);
	for (const [flag, packages] of optionalPackages) {
		if (flags[flag]) { for (const pack of packages) toInstall.add(pack); }
	}

	await writeFile(joinPath(projectDir, "deno.json"), denoJson(projectName, toInstall), dryRun);
	const partials = new CollectionMap<string, string>();
	const ropts = processFlagPartials(flags, partials);
	await loadTemplateFiles(projectDir, partials, ropts, template, dryRun);
}

/** Whether `projectDir` is somewhere an app can be created: absent, or empty. */
async function isUsable(projectDir: string): Promise<boolean> {
	let stat: Deno.FileInfo;
	try {
		stat = await Deno.stat(projectDir);
	} catch {
		return true; // nothing there yet
	}

	if (!stat.isDirectory) {
		console.log(`❌ ${projectDir} already exists and is not a directory`);
		return false;
	}
	const contents = await Array.fromAsync(Deno.readDir(projectDir));
	if (contents.length > 0) {
		console.log(`❌ ${projectDir} is not empty`);
		return false;
	}
	return true;
}

async function writeFile(path: string, content: string, dryRun: boolean) {
	console.log(`   writing ${path}...`);
	if (!dryRun) {
		await Deno.mkdir(path.split("/").slice(0, -1).join("/"), { recursive: true });
		await Deno.writeTextFile(path, content);
	}
}
