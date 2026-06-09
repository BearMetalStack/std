import { joinPath } from "@bearmetal/miscellanea";

const decoder = new TextDecoder();

function run(cmd: string[]): string {
	const result = new Deno.Command(cmd[0], {
		args: cmd.slice(1),
		stdout: "piped",
		stderr: "piped",
	});
	const { stdout } = result.outputSync();
	return decoder.decode(stdout).trim();
}

function getLatestTag(pkg: string): string | null {
	try {
		return run(["git", "describe", "--tags", `--match=${pkg}@*`, "--abbrev=0"]);
	} catch {
		return null;
	}
}

function getNextRetagSuffix(pkg: string, version: string): string {
	const tags = run(["git", "tag", "--list", `${pkg}@${version}-retag.*`]);
	if (!tags) return "-retag.1";
	const nums = tags.split("\n")
		.filter(Boolean)
		.map((t) => t.match(/-retag\.(\d+)$/)?.[1])
		.filter(Boolean)
		.map(Number);
	const max = nums.length ? Math.max(...nums) : 0;
	return `-retag.${max + 1}`;
}

function hasChanges(
	_pkg: string,
	dir: string,
	sinceTag: string | null,
): boolean {
	const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
	const log = run(["git", "log", range, "--oneline", "--", dir]);
	return log.length > 0;
}

async function promptBump(
	pkg: string,
	current: string,
): Promise<string | null> {
	const [real, dev = "dev.0"] = current.split("-");
	const [major, minor, patch] = real.split(".").map(Number);
	const bumpBy = dev !== "dev.0" ? 0 : 1;
	const retagSuffix = getNextRetagSuffix(pkg, current);
	const choice = prompt(
		`\n📦 ${pkg} has changes since ${current}\n` +
			`  p) patch (default) → ${major}.${minor}.${patch + bumpBy}\n` +
			`  m) minor → ${major}.${minor + bumpBy}.0\n` +
			`  M) major → ${major + bumpBy}.0.0\n` +
			`  d) dev → ${major}.${minor}.${patch + bumpBy}-${dev}\n` +
			`  r) retag → ${current}${retagSuffix}\n` +
			`  s) skip\n` +
			` => `,
		"p",
	)?.trim() ?? "p";

	if (choice === "p") return `${major}.${minor}.${patch + bumpBy}`;
	if (choice === "m") return `${major}.${minor + bumpBy}.0`;
	if (choice === "M") return `${major + bumpBy}.0.0`;
	if (choice === "d") {
		let [devname = "dev", version = 0] = dev.split(".").map((e) => Number(e) ? e : Number(e)) as [
			string,
			number,
		];
		devname = prompt(`Enter dev version name (default: ${devname}): `, devname) ||
			devname;
		[devname, version] = await checkPackageDevVersions(pkg, [devname, version]);
		return `${major}.${minor}.${patch}-${devname}.${version}`;
	}
	if (choice === "r") return "retag";
	return null;
}

async function checkPackageDevVersions(
	pks: string,
	[devname, version]: [string, number],
): Promise<[string, number]> {
	const devVersionFile = ".bearmetal/version_bump/dev.json";
	const json = JSON.parse(await Deno.readTextFile(devVersionFile)) as Record<
		string,
		Record<string, number[]>
	>;
	const devVersions = json[pks][devname].sort() ?? [];
	const latestVersion = devVersions[devVersions.length - 1] ?? 0;
	if (version <= latestVersion) {
		version = latestVersion + 1;
	}
	devVersions.push(version);
	json[pks][devname] = devVersions;
	await Deno.writeTextFile(devVersionFile, JSON.stringify(json, null, "\t"));
	return [devname, version];
}

async function findPackages(): Promise<Array<{ name: string; dir: string }>> {
	const packages: Array<{ name: string; dir: string }> = [];

	for await (const entry of Deno.readDir(".")) {
		if (!entry.isDirectory) continue;

		try {
			const denoJson = JSON.parse(
				await Deno.readTextFile(joinPath(Deno.cwd(), entry.name, "deno.json")),
			) as { name?: string; version?: string };
			if (denoJson.name?.startsWith("@bearmetal/") && denoJson.version) {
				packages.push({ name: denoJson.name, dir: entry.name });
			}
		} catch {
			/*  */
		}
	}

	return packages;
}

const status = run(["git", "status", "--porcelain"]);
if (status.length > 0) {
	console.error(
		"❌ you have uncommitted changes. we are not doing this right now. go clean up your mess.",
	);
	Deno.exit(1);
}

const packages = await findPackages();

const bumps: { name: string; dir: string; next: string }[] = [];
const retags: { name: string; current: string }[] = [];
for (const { name, dir } of packages) {
	const latestTag = getLatestTag(name);
	if (!hasChanges(name, dir, latestTag)) continue;

	const denoJson = JSON.parse(Deno.readTextFileSync(`${dir}/deno.json`));
	const current = denoJson.version ?? "0.0.0";
	let next = current;
	if (latestTag) { // We only want to bump if there is an existing tag, otherwise, create tag at current version
		next = await promptBump(name, current);
		if (!next) {
			console.log(`  skipped.`);
			continue;
		}
		if (next === "retag") {
			retags.push({ name, current });
			continue;
		}

		denoJson.version = next;
		Deno.writeTextFileSync(
			`${dir}/deno.json`,
			JSON.stringify(denoJson, null, "\t") + "\n",
		);
	}

	bumps.push({ name, dir, next });
}

if (bumps.length === 0 && retags.length === 0) {
	console.log("nothing to bump.");
	Deno.exit(0);
}

if (bumps.length > 0) {
	const message = "chore: " + bumps.map((b) => `${b.name}@${b.next}`).join(", ");
	run(["git", "add", ...bumps.map((b) => `${b.dir}/deno.json`)]);
	run(["git", "commit", "-m", message]);

	for (const { name, next } of bumps) {
		const tag = `${name}@${next}`;
		run(["git", "tag", tag]);
		console.log(`  ✓ tagged ${tag}`);
	}
}

for (const { name, current } of retags) {
	const tag = `${name}@${current}${getNextRetagSuffix(name, current)}`;
	run(["git", "tag", tag]);
	console.log(`  ✓ retagged ${tag}`);
}

console.log("\ndone. don't forget to git push --tags");
