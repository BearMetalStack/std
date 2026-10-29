/**
 * Bumps the version of every package with commits since its last release tag,
 * then commits and tags the result.
 *
 * A package with no tag yet is tagged at its current version rather than
 * bumped - the first tag establishes the baseline that later runs diff against.
 *
 * Three ways to drive it:
 *
 * ```sh
 * # inspect: what changed, the commits since each tag, a suggested bump
 * deno task workspace:bump-versions --plan [--json]
 *
 * # decide up front: every changed package must be covered, or nothing is written
 * deno task workspace:bump-versions --bump=router=minor --bump=jsx=patch [--default=skip]
 *
 * # interactive prompts (only when stdin is a terminal and no --bump/--default is given)
 * deno task workspace:bump-versions
 * ```
 *
 * A bump is one of `patch`, `minor`, `major`, `retag`, `skip`, `dev`,
 * `dev:<name>`, or an explicit version such as `1.2.0-beta.1`. Packages may be
 * named in full (`@bearmetal/router`) or by their bare name (`router`).
 */

import { parseArgs } from "@std/cli/parse-args";
import { dirname, join } from "@std/path";
import { discoverPackages, REPO_ROOT, SCOPE, type WorkspacePackage } from "./workspace.ts";
import { run, runOrNull, runOrThrow } from "./run.ts";

/** Tracks which dev-channel version numbers have already been handed out. */
const DEV_VERSION_FILE = join(REPO_ROOT, ".bearmetal/version_bump/dev.json");

const KINDS = ["patch", "minor", "major", "retag", "skip"] as const;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

type DevVersions = Record<string, Record<string, number[]>>;

type BumpKind =
	| { kind: (typeof KINDS)[number] }
	| { kind: "dev"; name?: string }
	| { kind: "exact"; version: string };

interface Commit {
	hash: string;
	subject: string;
	breaking: boolean;
}

interface Candidate {
	pkg: WorkspacePackage;
	tag: string | null;
	commits: Commit[];
}

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

/** Commits touching `dir` since `sinceTag` (or ever, when untagged), newest first. */
async function commitsSince(dir: string, sinceTag: string | null): Promise<Commit[]> {
	const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
	const { stdout } = await git(["log", range, "--format=%h%x1f%s%x1f%b%x1e", "--", dir]);
	return stdout.split("\x1e")
		.map((record) => record.trim())
		.filter(Boolean)
		.map((record) => {
			const [hash, subject, body = ""] = record.split("\x1f");
			const breaking = /^\w+(?:\([^)]*\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(body);
			return { hash, subject, breaking };
		});
}

/**
 * The conventional-commit reading of `commits`: breaking → major, feat → minor,
 * else patch. Below 1.0 a breaking change is a minor bump - leaving 0.x is a
 * deliberate decision, not something a `!` should propose.
 */
function suggestBump(current: string, commits: readonly Commit[]): "patch" | "minor" | "major" {
	if (commits.some((c) => c.breaking)) return parseVersion(current).major === 0 ? "minor" : "major";
	if (commits.some((c) => /^feat(?:\([^)]*\))?:/.test(c.subject))) return "minor";
	return "patch";
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

/**
 * The versions each kind would produce from `current`, without side effects.
 *
 * Promoting a prerelease lands on the version it was staged against, so the
 * release numbers only advance when leaving a stable version behind.
 */
function previewVersions(current: string): Record<"patch" | "minor" | "major" | "dev", string> {
	const { major, minor, patch, devName, devNumber, prerelease } = parseVersion(current);
	const step = prerelease ? 0 : 1;
	return {
		patch: `${major}.${minor}.${patch + step}`,
		minor: `${major}.${minor + step}.0`,
		major: `${major + step}.0.0`,
		dev: `${major}.${minor}.${patch}-${devName}.${devNumber + 1}`,
	};
}

function parseBumpKind(raw: string): BumpKind | null {
	if ((KINDS as readonly string[]).includes(raw)) {
		return { kind: raw as (typeof KINDS)[number] };
	}
	if (raw === "dev") return { kind: "dev" };
	if (raw.startsWith("dev:") && raw.length > 4) return { kind: "dev", name: raw.slice(4) };
	if (SEMVER.test(raw)) return { kind: "exact", version: raw };
	return null;
}

/** Turns a decided bump into the next version, `"retag"`, or null to skip. */
async function resolveBump(pkg: WorkspacePackage, bump: BumpKind): Promise<string | null> {
	switch (bump.kind) {
		case "skip":
			return null;
		case "retag":
			return "retag";
		case "exact":
			return bump.version;
		case "dev": {
			const { major, minor, patch, devName, devNumber } = parseVersion(pkg.version);
			const name = bump.name ?? devName;
			const number = await reserveDevVersion(pkg.name, name, devNumber + 1);
			return `${major}.${minor}.${patch}-${name}.${number}`;
		}
		default:
			return previewVersions(pkg.version)[bump.kind];
	}
}

async function promptBump(candidate: Candidate): Promise<BumpKind> {
	const { pkg, commits } = candidate;
	const preview = previewVersions(pkg.version);
	const retagSuffix = await nextRetagSuffix(pkg.name, pkg.version);

	console.log(`\n📦 ${pkg.name} has changes since ${pkg.version}`);
	for (const c of commits) console.log(`    ${c.hash} ${c.subject}`);

	const choice = prompt(
		`  p) patch (default) → ${preview.patch}\n` +
			`  m) minor → ${preview.minor}\n` +
			`  M) major → ${preview.major}\n` +
			`  d) dev → ${preview.dev}\n` +
			`  r) retag → ${pkg.version}${retagSuffix}\n` +
			`  s) skip\n` +
			` => `,
		"p",
	)?.trim() ?? "p";

	switch (choice) {
		case "p":
			return { kind: "patch" };
		case "m":
			return { kind: "minor" };
		case "M":
			return { kind: "major" };
		case "r":
			return { kind: "retag" };
		case "d": {
			const { devName } = parseVersion(pkg.version);
			const name = prompt(`Enter dev version name (default: ${devName}): `, devName)?.trim();
			return { kind: "dev", name: name || devName };
		}
		default:
			return { kind: "skip" };
	}
}

/** Rewrites the `version` field of a package's `deno.json` in place. */
async function writeVersion(pkg: WorkspacePackage, version: string): Promise<void> {
	const path = join(pkg.path, "deno.json");
	const config = JSON.parse(await Deno.readTextFile(path));
	config.version = version;
	await Deno.writeTextFile(path, JSON.stringify(config, null, "\t") + "\n");
}

async function findCandidates(): Promise<{ changed: Candidate[]; baselines: Candidate[] }> {
	const changed: Candidate[] = [];
	const baselines: Candidate[] = [];
	for (const pkg of await discoverPackages()) {
		const tag = await latestTag(pkg.name);
		const commits = await commitsSince(pkg.dir, tag);
		if (commits.length === 0) continue;
		(tag ? changed : baselines).push({ pkg, tag, commits });
	}
	return { changed, baselines };
}

function printPlan(changed: Candidate[], baselines: Candidate[], json: boolean): void {
	if (json) {
		console.log(JSON.stringify(
			{
				changed: changed.map(({ pkg, tag, commits }) => ({
					name: pkg.name,
					dir: pkg.dir,
					current: pkg.version,
					tag,
					suggested: suggestBump(pkg.version, commits),
					versions: previewVersions(pkg.version),
					commits,
				})),
				baselines: baselines.map(({ pkg }) => ({ name: pkg.name, version: pkg.version })),
			},
			null,
			"\t",
		));
		return;
	}

	if (changed.length === 0 && baselines.length === 0) {
		console.log("nothing to bump.");
		return;
	}
	for (const { pkg, tag, commits } of changed) {
		const v = previewVersions(pkg.version);
		console.log(
			`\n📦 ${pkg.name} ${pkg.version} (since ${tag}) — suggested: ${
				suggestBump(pkg.version, commits)
			}`,
		);
		console.log(`    patch → ${v.patch}  minor → ${v.minor}  major → ${v.major}  dev → ${v.dev}`);
		for (const c of commits) console.log(`    ${c.hash} ${c.breaking ? "‼ " : ""}${c.subject}`);
	}
	for (const { pkg } of baselines) {
		console.log(`\n🏷  ${pkg.name} has never been tagged; will be tagged at ${pkg.version}`);
	}
}

/** Maps `--bump` arguments onto packages, collecting every problem rather than stopping at one. */
function parseBumpArgs(
	args: readonly string[],
	changed: readonly Candidate[],
): { decisions: Map<string, BumpKind>; errors: string[] } {
	const decisions = new Map<string, BumpKind>();
	const errors: string[] = [];
	const changedNames = new Set(changed.map((c) => c.pkg.name));

	for (const arg of args) {
		const eq = arg.lastIndexOf("=");
		if (eq <= 0) {
			errors.push(`--bump=${arg}: expected <package>=<bump>`);
			continue;
		}
		const rawName = arg.slice(0, eq);
		const name = rawName.startsWith("@") ? rawName : `${SCOPE}/${rawName}`;
		const kind = parseBumpKind(arg.slice(eq + 1));

		if (!kind) errors.push(`--bump=${arg}: unknown bump "${arg.slice(eq + 1)}"`);
		else if (!changedNames.has(name)) {
			errors.push(`--bump=${arg}: ${name} has no changes since its last tag (or does not exist)`);
		} else if (decisions.has(name)) errors.push(`--bump=${arg}: ${name} given more than once`);
		else decisions.set(name, kind);
	}
	return { decisions, errors };
}

if (import.meta.main) {
	const flags = parseArgs(Deno.args, {
		boolean: ["plan", "json"],
		string: ["bump", "default"],
		collect: ["bump"],
	});

	const { changed, baselines } = await findCandidates();

	if (flags.plan) {
		printPlan(changed, baselines, flags.json);
		Deno.exit(0);
	}

	const { stdout: status } = await git(["status", "--porcelain"]);
	if (status.length > 0) {
		console.error(
			"❌ you have uncommitted changes. we are not doing this right now. go clean up your mess.",
		);
		Deno.exit(1);
	}

	if (changed.length === 0 && baselines.length === 0) {
		console.log("nothing to bump.");
		Deno.exit(0);
	}

	const bumpArgs = flags.bump as string[];
	const interactive = bumpArgs.length === 0 && flags.default === undefined;
	const decisions = new Map<string, BumpKind>();

	if (interactive) {
		if (changed.length > 0 && !Deno.stdin.isTerminal()) {
			printPlan(changed, baselines, false);
			console.error(
				"\n❌ stdin is not a terminal, so there is nobody to ask. " +
					"decide with --bump=<package>=<bump> (and optionally --default=<bump>).",
			);
			Deno.exit(1);
		}
		for (const candidate of changed) {
			decisions.set(candidate.pkg.name, await promptBump(candidate));
		}
	} else {
		const parsed = parseBumpArgs(bumpArgs, changed);
		const errors = [...parsed.errors];
		const fallback = flags.default === undefined ? undefined : parseBumpKind(flags.default);
		if (fallback === null) errors.push(`--default=${flags.default}: unknown bump`);
		if (fallback?.kind === "exact") {
			errors.push(`--default=${flags.default}: an explicit version cannot be a default`);
		}

		for (const { pkg } of changed) {
			const decision = parsed.decisions.get(pkg.name) ?? fallback ?? undefined;
			if (decision) decisions.set(pkg.name, decision);
			else errors.push(`${pkg.name} has changes but no --bump was given (and no --default)`);
		}

		if (errors.length > 0) {
			for (const error of errors) console.error(`❌ ${error}`);
			console.error("\nnothing was written. run with --plan to see what changed.");
			Deno.exit(1);
		}
	}

	const bumps: Bump[] = [];
	const retags: WorkspacePackage[] = [];

	for (const { pkg } of changed) {
		const next = await resolveBump(pkg, decisions.get(pkg.name)!);
		if (!next) {
			console.log(`  - skipped ${pkg.name}`);
			continue;
		}
		if (next === "retag") {
			retags.push(pkg);
			continue;
		}
		await writeVersion(pkg, next);
		bumps.push({ pkg, next });
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

	const baselineBumps = baselines.map(({ pkg }) => ({ pkg, next: pkg.version }));
	for (const { pkg, next } of [...bumps, ...baselineBumps]) {
		const tag = `${pkg.name}@${next}`;
		await runOrThrow(["git", "tag", tag], { cwd: REPO_ROOT });
		console.log(`  ✓ tagged ${tag}`);
	}

	for (const pkg of retags) {
		const tag = `${pkg.name}@${pkg.version}${await nextRetagSuffix(pkg.name, pkg.version)}`;
		await runOrThrow(["git", "tag", tag], { cwd: REPO_ROOT });
		console.log(`  ✓ retagged ${tag}`);
	}

	await git(["push", "--tags"]);

	console.log("\ndone.");
}
