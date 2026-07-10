/**
 * Publishes every publishable workspace package to JSR, in dependency order.
 *
 * Each package waits on the publish results of its own dependencies, so a
 * failure anywhere short-circuits everything downstream of it instead of
 * pushing a package whose dependencies do not exist on the registry yet.
 */

import { parseArgs } from "@std/cli/parse-args";
import { buildDependencyGraph, type DependencyGraph, findCycles } from "./dep_graph.ts";
import { discoverPackages, type WorkspacePackage } from "./workspace.ts";
import { run } from "./run.ts";

/**
 * A published package may not depend on an unpublished one: the dependency
 * would be unresolvable on JSR even though it resolves locally through the
 * workspace. Caught here rather than by a confusing `deno publish` failure.
 */
function findUnpublishableDeps(
	graph: DependencyGraph,
	packages: readonly WorkspacePackage[],
): string[] {
	const byName = new Map(packages.map((p) => [p.name, p]));
	const problems: string[] = [];

	for (const [name, deps] of graph) {
		if (!byName.get(name)?.publishable) continue;
		for (const dep of deps) {
			if (!byName.get(dep)?.publishable) {
				problems.push(`${name} depends on ${dep}, which is marked "publish": false`);
			}
		}
	}
	return problems;
}

async function publishPackage(
	pkg: WorkspacePackage,
	deps: readonly string[],
	results: Record<string, Promise<boolean>>,
	options: { token: string; dryRun: boolean },
): Promise<boolean> {
	// Yield once so every entry of `results` is populated before we read it.
	await Promise.resolve();

	const depResults = await Promise.all(
		deps.map(async (dep) => [dep, (await results[dep]) ?? false] as const),
	);
	const blocked = depResults.filter(([, ok]) => !ok).map(([dep]) => dep);
	if (blocked.length > 0) {
		console.error(`skipping ${pkg.name}: dependencies failed to publish: ${blocked.join(", ")}`);
		return false;
	}

	if (!pkg.publishable) {
		console.log(`skipping ${pkg.name} ("publish": false)`);
		// Internal-only: nothing to push, but dependents are not blocked by it.
		return true;
	}

	console.log(`publishing ${pkg.name}@${pkg.version}...`);
	const result = await run([
		"deno",
		"publish",
		"-q",
		`--token=${options.token}`,
		...(options.dryRun ? ["--dry-run"] : []),
	], { cwd: pkg.path });

	if (result.success) {
		console.log(`%c  ✓ ${pkg.name}@${pkg.version}`, "color: green");
	} else {
		console.error(`%c  ✗ ${pkg.name}@${pkg.version}`, "color: red");
		if (result.stderr) console.error(result.stderr);
	}
	return result.success;
}

async function publishWorkspace(dryRun: boolean): Promise<number> {
	const token = Deno.env.get("JSR_PUBLISH_TOKEN");
	if (!token) {
		console.error("JSR_PUBLISH_TOKEN not set");
		return 1;
	}

	const [graph, packages] = await Promise.all([buildDependencyGraph(), discoverPackages()]);

	const cycles = findCycles(graph);
	if (cycles.length > 0) {
		for (const cycle of cycles) {
			console.error(`%ccircular dependency: ${cycle.join(" → ")}`, "color: red");
		}
		return 1;
	}

	const problems = findUnpublishableDeps(graph, packages);
	if (problems.length > 0) {
		for (const problem of problems) console.error(`%c${problem}`, "color: red");
		return 1;
	}

	const results: Record<string, Promise<boolean>> = {};
	for (const pkg of packages) {
		results[pkg.name] = publishPackage(pkg, graph.get(pkg.name) ?? [], results, {
			token,
			dryRun,
		});
	}

	const settled = await Promise.all(Object.values(results));
	const failures = settled.filter((ok) => !ok).length;

	if (failures > 0) {
		console.error(`\n%c${failures} package(s) failed to publish`, "color: red");
		return 1;
	}
	console.log(`\n%cworkspace publish complete${dryRun ? " (dry run)" : ""}`, "color: green");
	return 0;
}

if (import.meta.main) {
	const flags = parseArgs(Deno.args, { boolean: ["dry-run"] });
	Deno.exit(await publishWorkspace(flags["dry-run"]));
}
