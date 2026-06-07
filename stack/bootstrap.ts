import type { flags } from "./flags.ts";
import { buildMainTs, denoJson } from "./tempate.ts";

async function denoAdd(packages: string[], projectDir: string) {
	const cmd = new Deno.Command("deno", {
		args: ["add", ...packages],
		cwd: projectDir,
		stdout: "inherit",
		stderr: "inherit",
	});
	const { code } = await cmd.output();
	if (code !== 0) throw new Error(`deno add failed with exit code ${code}`);
}

export async function bootstrap(opts: { flags: flags; projectName: string; dirname?: string }) {
	const { flags, projectName } = opts;
	const projectDir = `./${projectName}`;

	await Deno.mkdir(projectDir, { recursive: true });

	await Deno.writeTextFile(
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

	// Write main.ts
	const mainTs = buildMainTs(flags);
	await Deno.writeTextFile(`${projectDir}/main.ts`, mainTs);

	console.log(`\n✅ Created ${projectName}`);
	console.log(`   cd ${projectName} && deno task dev`);
}
