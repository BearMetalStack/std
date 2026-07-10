/**
 * Type-checks and lints every workspace package from inside its own directory -
 * the same working directory `deno publish` uses, and so the configuration a
 * consumer of that package actually resolves.
 *
 * A package's effective config is the root `deno.json` merged with its own,
 * key by key, its own winning. `lib` is replaced wholesale rather than unioned,
 * which is the sharp edge: workspace dependencies resolve to local source and
 * are type-checked under the *importing* package's `compilerOptions`, so a
 * `lib` that omits `deno.ns` breaks its dependencies' sources rather than its
 * own. Keeping `lib` defined once, at the root, is what makes a package's
 * result independent of who imports it.
 *
 * `deno check .` at the repo root reports much the same diagnostics, but as one
 * undifferentiated pass. Running per package gives an independent exit status
 * and attribution for each one, which is what a CI matrix needs, and it fails
 * loudly when a root-config change breaks a single member.
 *
 * Exits non-zero if any package fails.
 *
 * Usage (no `--` separator: `deno task` forwards trailing args as-is, and a
 * bare `--` would end flag parsing before they were seen):
 *   deno task workspace:check
 *   deno task workspace:check --filter=router --filter=app
 *   deno task workspace:check --no-lint --concurrency=8
 *   deno task workspace:check --fmt        # also verify formatting
 */

import { parseArgs } from "@std/cli/parse-args";
import { discoverPackages, type WorkspacePackage } from "./workspace.ts";
import { type CommandResult, pooled, run } from "./run.ts";

interface StepResult {
	step: string;
	result: CommandResult;
}

interface PackageResult {
	pkg: WorkspacePackage;
	failures: StepResult[];
}

/** The commands run in each package directory, in order. */
function stepsFor(flags: { lint: boolean; fmt: boolean }): [string, string[]][] {
	const steps: [string, string[]][] = [["check", ["deno", "check", "."]]];
	if (flags.lint) steps.push(["lint", ["deno", "lint"]]);
	if (flags.fmt) steps.push(["fmt", ["deno", "fmt", "--check"]]);
	return steps;
}

async function verifyPackage(
	pkg: WorkspacePackage,
	steps: [string, string[]][],
): Promise<PackageResult> {
	const failures: StepResult[] = [];

	for (const [step, cmd] of steps) {
		const result = await run(cmd, { cwd: pkg.path });
		if (!result.success) failures.push({ step, result });
	}

	console.log(
		failures.length === 0
			? `%c  ok  %c ${pkg.name}`
			: `%c fail %c ${pkg.name} (${failures.map((f) => f.step).join(", ")})`,
		failures.length === 0 ? "color: green" : "color: red",
		"",
	);

	return { pkg, failures };
}

if (import.meta.main) {
	const flags = parseArgs(Deno.args, {
		boolean: ["lint", "fmt", "help"],
		string: ["filter", "concurrency"],
		collect: ["filter"],
		default: { lint: true, fmt: false, concurrency: "4" },
		negatable: ["lint"],
	});

	if (flags.help) {
		console.log(
			"usage: workspace:check [--filter=<pkg>]... [--no-lint] [--fmt] [--concurrency=N]",
		);
		Deno.exit(0);
	}

	const concurrency = Math.max(1, Number(flags.concurrency) || 1);
	const filters = flags.filter as string[];

	let packages = await discoverPackages();
	if (filters.length > 0) {
		// Match on the bare name or the fully qualified one, whichever the user typed.
		packages = packages.filter((p) =>
			filters.some((f) => p.name === f || p.name.split("/")[1] === f)
		);
		if (packages.length === 0) {
			console.error(`no packages matched: ${filters.join(", ")}`);
			Deno.exit(1);
		}
	}

	const steps = stepsFor(flags);
	console.log(
		`checking ${packages.length} packages (${
			steps.map(([s]) => s).join(" + ")
		}, concurrency ${concurrency})\n`,
	);

	const started = performance.now();
	const results = await pooled(
		packages.map((pkg) => () => verifyPackage(pkg, steps)),
		concurrency,
	);
	const elapsed = ((performance.now() - started) / 1000).toFixed(1);

	const failed = results.filter((r) => r.failures.length > 0);

	for (const { pkg, failures } of failed) {
		for (const { step, result } of failures) {
			console.error(`\n%c─── ${pkg.name} · ${step} ───`, "color: red");
			// `deno check` writes diagnostics to stderr, `deno lint` to stdout.
			const output = [result.stderr, result.stdout].filter(Boolean).join("\n");
			console.error(output || `(no output, exit ${result.code})`);
		}
	}

	console.log(
		`\n%c${results.length - failed.length}/${results.length} packages passed in ${elapsed}s`,
		failed.length === 0 ? "color: green" : "color: red",
	);

	if (failed.length > 0) {
		console.error(`failed: ${failed.map((f) => f.pkg.name).join(", ")}`);
		Deno.exit(1);
	}
}
