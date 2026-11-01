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
 *
 * **Dependents are bumped too.** `deno publish` pins a package's in-workspace
 * dependencies as `~<their version at the time>`, so a published package only
 * ever accepts patch releases of what it imports. When a bump takes a
 * dependency outside the range a dependent was last released against, the
 * dependent has to be released again, commits or not - otherwise a consumer on
 * the new version also loads the old one through the stale dependent, and gets
 * two copies of every module-level registry. Those dependents are offered for
 * a bump (interactively), or patched by default (with `--bump`/`--default`,
 * where `--bump=<pkg>=<bump>` still overrides). `--default` does not apply to
 * them: a `--default=skip` meant for unchanged-looking packages would quietly
 * reintroduce exactly the split this exists to prevent.
 */

import { parseArgs } from "@std/cli/parse-args";
import { dirname, join } from "@std/path";
import { buildDependencyGraph, type DependencyGraph } from "./dep_graph.ts";
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

/** One dependency a released package pins to a range its next version falls outside. */
interface StalePin {
	dep: string;
	/** The dependency's version when the dependent was last released: the range is `~against`. */
	against: string;
	/** The version the dependency is at (or about to be bumped to). */
	now: string;
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

async function promptBump(candidate: Candidate, pins: readonly StalePin[] = []): Promise<BumpKind> {
	const { pkg, commits } = candidate;
	const preview = previewVersions(pkg.version);
	const retagSuffix = await nextRetagSuffix(pkg.name, pkg.version);

	if (commits.length > 0) {
		console.log(`\n📦 ${pkg.name} has changes since ${pkg.version}`);
		for (const c of commits) console.log(`    ${c.hash} ${c.subject}`);
	} else {
		console.log(`\n🔗 ${pkg.name} ${pkg.version} has no changes, but must be re-released`);
	}
	for (const line of describePins(pins)) console.log(`    ⚠ ${line}`);

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

interface Workspace {
	packages: Map<string, WorkspacePackage>;
	tags: Map<string, string | null>;
	graph: DependencyGraph;
	changed: Candidate[];
	baselines: Candidate[];
}

async function loadWorkspace(): Promise<Workspace> {
	const [discovered, graph] = await Promise.all([discoverPackages(), buildDependencyGraph()]);
	const packages = new Map(discovered.map((pkg) => [pkg.name, pkg]));
	const tags = new Map<string, string | null>();
	const changed: Candidate[] = [];
	const baselines: Candidate[] = [];
	for (const pkg of discovered) {
		const tag = await latestTag(pkg.name);
		tags.set(pkg.name, tag);
		const commits = await commitsSince(pkg.dir, tag);
		if (commits.length === 0) continue;
		(tag ? changed : baselines).push({ pkg, tag, commits });
	}
	return { packages, tags, graph, changed, baselines };
}

/**
 * Whether `~base` - what `deno publish` writes for an in-workspace dependency -
 * accepts `version`: same major and minor, no lower patch, and not a
 * prerelease (a range without one never matches one).
 */
function tildeAccepts(base: string, version: string): boolean {
	const b = parseVersion(base);
	const v = parseVersion(version);
	if (v.prerelease) return base === version;
	return v.major === b.major && v.minor === b.minor && v.patch >= b.patch;
}

const versionAtTagCache = new Map<string, string | null>();

/** `dir`'s `deno.json` version as of `tag`, or null when it did not exist then. */
async function versionAtTag(tag: string, dir: string): Promise<string | null> {
	const key = `${tag}\0${dir}`;
	if (!versionAtTagCache.has(key)) {
		const raw = await runOrNull(["git", "show", `${tag}:${dir}/deno.json`], { cwd: REPO_ROOT });
		let version: string | null = null;
		try {
			version = raw ? (JSON.parse(raw).version ?? null) : null;
		} catch {
			// An unparseable config at that tag tells us nothing about the range.
		}
		versionAtTagCache.set(key, version);
	}
	return versionAtTagCache.get(key)!;
}

/**
 * Released, publishable packages whose last release pins a dependency to a
 * range that `versionOf(dep)` falls outside - each needs releasing again.
 *
 * The range comes from the dependency's version at the dependent's own release
 * tag, which is the workspace `deno publish` saw when it wrote the pin.
 */
async function findStale(
	ws: Workspace,
	versionOf: (name: string) => string,
): Promise<Map<string, StalePin[]>> {
	const stale = new Map<string, StalePin[]>();
	for (const [name, deps] of ws.graph) {
		const pkg = ws.packages.get(name);
		const tag = ws.tags.get(name);
		if (!pkg?.publishable || !tag) continue;
		for (const depName of deps) {
			const dep = ws.packages.get(depName);
			if (!dep?.publishable) continue;
			const against = await versionAtTag(tag, dep.dir);
			if (!against) continue;
			const now = versionOf(depName);
			if (tildeAccepts(against, now)) continue;
			const pins = stale.get(name) ?? [];
			pins.push({ dep: depName, against, now });
			stale.set(name, pins);
		}
	}
	return stale;
}

function describePins(pins: readonly StalePin[]): string[] {
	return pins.map((p) => `${p.dep}: released against ~${p.against}, which won't accept ${p.now}`);
}

/** A dependent the plan would release only because a dependency left its range. */
interface Cascade {
	pkg: WorkspacePackage;
	pins: StalePin[];
}

/**
 * The dependents the plan's suggested bumps would force out, to a fixpoint.
 * Cascades are previewed as patches, which never leave a `~` range, so one
 * pass past the changed packages settles it - the loop is for symmetry with
 * the real run, where a cascade can be bumped further.
 */
async function planCascades(ws: Workspace): Promise<Cascade[]> {
	const next = new Map<string, string>();
	for (const { pkg, commits } of ws.changed) {
		next.set(pkg.name, previewVersions(pkg.version)[suggestBump(pkg.version, commits)]);
	}
	const changedNames = new Set(ws.changed.map((c) => c.pkg.name));
	const cascades = new Map<string, Cascade>();
	for (;;) {
		const stale = await findStale(ws, (n) => next.get(n) ?? ws.packages.get(n)!.version);
		let grew = false;
		for (const [name, pins] of stale) {
			if (changedNames.has(name) || cascades.has(name)) continue;
			const pkg = ws.packages.get(name)!;
			cascades.set(name, { pkg, pins });
			next.set(name, previewVersions(pkg.version).patch);
			grew = true;
		}
		if (!grew) break;
	}
	return [...cascades.values()];
}

function printPlan(ws: Workspace, cascades: Cascade[], json: boolean): void {
	const { changed, baselines } = ws;
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
				dependents: cascades.map(({ pkg, pins }) => ({
					name: pkg.name,
					dir: pkg.dir,
					current: pkg.version,
					suggested: "patch",
					versions: previewVersions(pkg.version),
					stale: pins,
				})),
				baselines: baselines.map(({ pkg }) => ({ name: pkg.name, version: pkg.version })),
			},
			null,
			"\t",
		));
		return;
	}

	if (changed.length === 0 && baselines.length === 0 && cascades.length === 0) {
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
	for (const { pkg, pins } of cascades) {
		console.log(
			`\n🔗 ${pkg.name} ${pkg.version} — no changes, must be re-released: patch → ${
				previewVersions(pkg.version).patch
			}`,
		);
		for (const line of describePins(pins)) console.log(`    ${line}`);
	}
	for (const { pkg } of baselines) {
		console.log(`\n🏷  ${pkg.name} has never been tagged; will be tagged at ${pkg.version}`);
	}
}

/**
 * Maps `--bump` arguments onto packages, collecting every problem rather than
 * stopping at one. Any released package may be named here, since which
 * dependents get cascaded is only known once the other bumps are decided;
 * `main` rejects a name that turned out to be neither changed nor cascaded.
 */
function parseBumpArgs(
	args: readonly string[],
	ws: Workspace,
): { decisions: Map<string, BumpKind>; errors: string[] } {
	const decisions = new Map<string, BumpKind>();
	const errors: string[] = [];

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
		else if (!ws.packages.has(name)) errors.push(`--bump=${arg}: ${name} does not exist`);
		else if (decisions.has(name)) errors.push(`--bump=${arg}: ${name} given more than once`);
		else decisions.set(name, kind);
	}
	return { decisions, errors };
}

function fail(errors: readonly string[]): never {
	for (const error of errors) console.error(`❌ ${error}`);
	console.error("\nnothing was written. run with --plan to see what changed.");
	Deno.exit(1);
}

if (import.meta.main) {
	const flags = parseArgs(Deno.args, {
		boolean: ["plan", "json"],
		string: ["bump", "default"],
		collect: ["bump"],
	});

	const ws = await loadWorkspace();
	const { changed, baselines } = ws;

	if (flags.plan) {
		printPlan(ws, await planCascades(ws), flags.json);
		Deno.exit(0);
	}

	const { stdout: status } = await git(["status", "--porcelain"]);
	if (status.length > 0) {
		console.error(
			"❌ you have uncommitted changes. we are not doing this right now. go clean up your mess.",
		);
		Deno.exit(1);
	}

	// Stale dependents can exist with nothing changed: a release that skipped
	// them is exactly what leaves them behind.
	const initialCascades = await planCascades(ws);
	if (changed.length === 0 && baselines.length === 0 && initialCascades.length === 0) {
		console.log("nothing to bump.");
		Deno.exit(0);
	}

	const bumpArgs = flags.bump as string[];
	const interactive = bumpArgs.length === 0 && flags.default === undefined;
	const decisions = new Map<string, BumpKind>();
	let explicit = new Map<string, BumpKind>();

	if (interactive) {
		if (!Deno.stdin.isTerminal()) {
			printPlan(ws, initialCascades, false);
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
		const parsed = parseBumpArgs(bumpArgs, ws);
		explicit = parsed.decisions;
		const errors = [...parsed.errors];
		const fallback = flags.default === undefined ? undefined : parseBumpKind(flags.default);
		if (fallback === null) errors.push(`--default=${flags.default}: unknown bump`);
		if (fallback?.kind === "exact") {
			errors.push(`--default=${flags.default}: an explicit version cannot be a default`);
		}

		for (const { pkg } of changed) {
			const decision = explicit.get(pkg.name) ?? fallback ?? undefined;
			if (decision) decisions.set(pkg.name, decision);
			else errors.push(`${pkg.name} has changes but no --bump was given (and no --default)`);
		}

		if (errors.length > 0) fail(errors);
	}

	// Resolve every decision before writing anything, cascading to dependents
	// as each round of bumps pushes more of them out of range.
	const next = new Map<string, string>();
	const retags: WorkspacePackage[] = [];
	const decide = async (pkg: WorkspacePackage, decision: BumpKind) => {
		const version = await resolveBump(pkg, decision);
		if (!version) console.log(`  - skipped ${pkg.name}`);
		else if (version === "retag") retags.push(pkg);
		else next.set(pkg.name, version);
	};

	for (const { pkg } of changed) await decide(pkg, decisions.get(pkg.name)!);

	const versionOf = (name: string) => next.get(name) ?? ws.packages.get(name)!.version;
	const considered = new Set(changed.map((c) => c.pkg.name));
	for (;;) {
		const stale = await findStale(ws, versionOf);
		const fresh = [...stale].filter(([name]) => !considered.has(name));
		if (fresh.length === 0) break;
		for (const [name, pins] of fresh) {
			considered.add(name);
			const pkg = ws.packages.get(name)!;
			const decision = interactive
				? await promptBump({ pkg, tag: ws.tags.get(name)!, commits: [] }, pins)
				: explicit.get(name) ?? { kind: "patch" as const };
			if (!interactive && !explicit.has(name)) {
				console.log(`  🔗 cascading to ${name}: ${describePins(pins).join("; ")}`);
			}
			await decide(pkg, decision);
		}
	}

	const unused = [...explicit.keys()].filter((name) => !considered.has(name));
	if (unused.length > 0) {
		fail(
			unused.map((name) =>
				`--bump for ${name}: it has no changes since its last tag and no dependency left its range`
			),
		);
	}

	// Whatever was skipped or retagged while stale stays stale; say so loudly.
	for (const [name, pins] of await findStale(ws, versionOf)) {
		if (next.has(name)) continue;
		console.warn(
			`  ⚠ ${name} stays released against an out-of-range dependency - ` +
				`anything using it alongside the new version loads both:\n` +
				describePins(pins).map((l) => `      ${l}`).join("\n"),
		);
	}

	const bumps: Bump[] = [];
	for (const [name, version] of next) {
		const pkg = ws.packages.get(name)!;
		await writeVersion(pkg, version);
		bumps.push({ pkg, next: version });
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

	await git(["push"]);
	await git(["push", "--tags"]);

	console.log("\ndone.");
}
