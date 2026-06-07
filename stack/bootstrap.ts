import type { flags } from "./flags.ts";
import { buildMainTs as buildFiles, denoJson } from "./tempate.ts";

async function denoAdd(packages: string[], projectDir: string) {
	const cmd = new Deno.Command("deno", {
		args: ["add", ...packages],
		cwd: await Deno.realPath(projectDir),
		stdout: "inherit",
		stderr: "inherit",
	});
	const { code } = await cmd.output();
	if (code !== 0) throw new Error(`deno add failed with exit code ${code}`);
}

export async function bootstrap(opts: { flags: flags; projectName: string; dirname?: string }) {
	const dryRun = Deno.args.includes("--dry-run");
	const { flags, projectName } = opts;
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

	await writeFile(
		`${projectDir}/deno.json`,
		denoJson(projectName),
	);

	const basePackages = ["jsr:@bearmetal/app", "jsr:@bearmetal/router"];
	const optionalPackages: [keyof flags, string][] = [
		["devProxy", "jsr:@bearmetal/devproxy"],
		["miscellanea", "jsr:@bearmetal/miscellanea"],
		["db", "jsr:@bearmetal/db"],
	];

	const toInstall = new Set<string>(basePackages);
	for (const [flag, pack] of optionalPackages) {
		if (flags[flag]) toInstall.add(pack);
	}

	await denoAdd([...toInstall], projectDir);

	const files = buildFiles(flags);
	for (const [file, content] of files) {
		await writeFile(`${projectDir}/${file}`, content());
	}
}

async function writeFile(path: string, content: string) {
	const dryRun = Deno.args.includes("--dry-run");
	console.log(`   writing ${path}...`);
	if (!dryRun) {
		await Deno.writeTextFile(path, content);
	}
}
