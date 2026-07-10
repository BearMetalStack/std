/**
 * Interactively bumps the version of every package with commits since its last
 * release tag, then commits and tags the result.
 *
 * A package with no tag yet is tagged at its current version rather than
 * bumped - the first tag establishes the baseline that later runs diff against.
 */

import { dirname, join } from "@std/path";
import { discoverPackages, REPO_ROOT, type WorkspacePackage } from "./workspace.ts";
import { run, runOrNull, runOrThrow } from "./run.ts";

/** Tracks which dev-channel version numbers have already been handed out. */
const DEV_VERSION_FILE = join(REPO_ROOT, ".bearmetal/version_bump/dev.json");

type DevVersions = Record<string, Record<string, number[]>>;

interface Bump {
	pkg: WorkspacePackage;
	next: string;
}

const git = (args: string[]) => run(["git", ...args], { cwd: REPO_ROOT });

/** The newest release tag for `pkg`, or null when it has never been tagged. */
async function latestTag(pkg: string): Promise<string | null> {
	return await runOrNull(
		["git", "describe", "--tags", `--match=${pkg}@*`, "--abbrev=0"],
		{ cwd: REPO_ROOT },
	);
}

/** True when commits touched `dir` since `sinceTag` (or ever, when untagged). */
async function hasChanges(dir: string, sinceTag: string | null): Promise<boolean> {
	const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
	const { stdout } = await git(["log", range, "--oneline", "--", dir]);
	return stdout.length > 0;
}

/** `-retag.N` with N one past the highest existing retag of this exact version. */
async function nextRetagSuffix(pkg: string, version: string): Promise<string> {
	const { stdout } = await git(["tag", "--list", `${pkg}@${version}-retag.*`]);
	const numbers = stdout.split("\n")
		.map((tag) => tag.match(/-retag\.(\d+)$/)?.[1])
		.filter((n): n is string => !!n)
		.map(Number);
	const highest = numbers.length > 0 ? Math.max(...numbers) : 0;
	return `-retag.${highest + 1}`;
}

async function readDevVersions(): Promise<DevVersions> {
	try {
		return JSON.parse(await Deno.readTextFile(DEV_VERSION_FILE)) as DevVersions;
	} catch {
		// First dev bump on a fresh clone: start from an empty ledger rather
		// than crashing, which is what the previous implementation did.
		return {};
	}
}

/**
 * Reserves the next free dev version for `pkg` on the `devName` channel.
 *
 * Numbers are compared numerically; a lexicographic sort would rank 10 below 9.
 */
async function reserveDevVersion(
	pkg: string,
	devName: string,
	requested: number,
): Promise<number> {
	const ledger = await readDevVersions();
	const channels = ledger[pkg] ??= {};
	const used = channels[devName] ??= [];

	const highest = used.length > 0 ? Math.max(...used) : -1;
	const version = requested > highest ? requested : highest + 1;

	used.push(version);
	used.sort((a, b) => a - b);

	await Deno.mkdir(dirname(DEV_VERSION_FILE), { recursive: true });
	await Deno.writeTextFile(DEV_VERSION_FILE, JSON.stringify(ledger, null, "\t") + "\n");
	return version;
}

/** Splits `1.2.3-dev.4` into its release triple and prerelease parts. */
function parseVersion(version: string): {
	major: number;
	minor: number;
	patch: number;
	devName: string;
	devNumber: number;
	prerelease: boolean;
} {
	const [release, prerelease] = version.split("-");
	const [major, minor, patch] = release.split(".").map(Number);

	// `dev.4` -> name `dev`, number 4. A bare `beta` gets number 0.
	const [devName = "dev", rawNumber = "0"] = prerelease?.split(".") ?? [];
	const devNumber = Number.isFinite(Number(rawNumber)) ? Number(rawNumber) : 0;

	return { major, minor, patch, devName, devNumber, prerelease: prerelease !== undefined };
}

/** Returns the next version, `"retag"`, or null to skip. */
async function promptBump(pkg: string, current: string): Promise<string | null> {
	const { major, minor, patch, devName, devNumber, prerelease } = parseVersion(current);

	// Promoting a prerelease lands on the version it was staged against, so the
	// release numbers only advance when leaving a stable version behind.
	const step = prerelease ? 0 : 1;
	const retagSuffix = await nextRetagSuffix(pkg, current);

	const choice = prompt(
		`\n📦 ${pkg} has changes since ${current}\n` +
			`  p) patch (default) → ${major}.${minor}.${patch + step}\n` +
			`  m) minor → ${major}.${minor + step}.0\n` +
			`  M) major → ${major + step}.0.0\n` +
			`  d) dev → ${major}.${minor}.${patch}-${devName}.${devNumber + 1}\n` +
			`  r) retag → ${current}${retagSuffix}\n` +
			`  s) skip\n` +
			` => `,
		"p",
	)?.trim() ?? "p";

	switch (choice) {
		case "p":
			return `${major}.${minor}.${patch + step}`;
		case "m":
			return `${major}.${minor + step}.0`;
		case "M":
			return `${major + step}.0.0`;
		case "r":
			return "retag";
		case "d": {
			const name = prompt(`Enter dev version name (default: ${devName}): `, devName)?.trim() ||
				devName;
			const number = await reserveDevVersion(pkg, name, devNumber + 1);
			return `${major}.${minor}.${patch}-${name}.${number}`;
		}
		default:
			return null;
	}
}

/** Rewrites the `version` field of a package's `deno.json` in place. */
async function writeVersion(pkg: WorkspacePackage, version: string): Promise<void> {
	const path = join(pkg.path, "deno.json");
	const config = JSON.parse(await Deno.readTextFile(path));
	config.version = version;
	await Deno.writeTextFile(path, JSON.stringify(config, null, "\t") + "\n");
}

if (import.meta.main) {
	const { stdout: status } = await git(["status", "--porcelain"]);
	if (status.length > 0) {
		console.error(
			"❌ you have uncommitted changes. we are not doing this right now. go clean up your mess.",
		);
		Deno.exit(1);
	}

	const bumps: Bump[] = [];
	const retags: { pkg: WorkspacePackage; version: string }[] = [];
	// Packages tagged for the first time: no version change, so nothing to commit.
	const baselines: Bump[] = [];

	for (const pkg of await discoverPackages()) {
		const tag = await latestTag(pkg.name);
		if (!(await hasChanges(pkg.dir, tag))) continue;

		if (!tag) {
			baselines.push({ pkg, next: pkg.version });
			continue;
		}

		const next = await promptBump(pkg.name, pkg.version);
		if (!next) {
			console.log("  skipped.");
			continue;
		}
		if (next === "retag") {
			retags.push({ pkg, version: pkg.version });
			continue;
		}

		await writeVersion(pkg, next);
		bumps.push({ pkg, next });
	}

	if (bumps.length === 0 && retags.length === 0 && baselines.length === 0) {
		console.log("nothing to bump.");
		Deno.exit(0);
	}

	// Only the bumped packages have a modified deno.json; committing the
	// baselines' unchanged files would abort the commit with "nothing to commit".
	if (bumps.length > 0) {
		const message = "chore: " + bumps.map((b) => `${b.pkg.name}@${b.next}`).join(", ");
		await runOrThrow(
			["git", "add", ...bumps.map((b) => join(b.pkg.dir, "deno.json"))],
			{ cwd: REPO_ROOT },
		);
		await runOrThrow(["git", "commit", "-m", message], { cwd: REPO_ROOT });
	}

	for (const { pkg, next } of [...bumps, ...baselines]) {
		const tag = `${pkg.name}@${next}`;
		await runOrThrow(["git", "tag", tag], { cwd: REPO_ROOT });
		console.log(`  ✓ tagged ${tag}`);
	}

	for (const { pkg, version } of retags) {
		const tag = `${pkg.name}@${version}${await nextRetagSuffix(pkg.name, version)}`;
		await runOrThrow(["git", "tag", tag], { cwd: REPO_ROOT });
		console.log(`  ✓ retagged ${tag}`);
	}

	console.log("\ndone. don't forget to git push --tags");
}
