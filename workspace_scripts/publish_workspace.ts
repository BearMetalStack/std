/**
 * Publishes the workspace to JSR with a single `deno publish` from the repo
 * root, which orders members by dependency, skips `"publish": false` members,
 * and skips versions that already exist on the registry.
 *
 * What it does not catch is a published package depending on an unpublished
 * one: locally that resolves through the workspace, and at publish time the
 * bare specifier is rewritten into a `jsr:` one that will never resolve. That
 * check runs here first.
 */

import { parseArgs } from "@std/cli/parse-args";
import { buildDependencyGraph, type DependencyGraph } from "./dep_graph.ts";
import { discoverPackages, REPO_ROOT, type WorkspacePackage } from "./workspace.ts";

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

async function publishWorkspace(dryRun: boolean): Promise<number> {
	const token = Deno.env.get("JSR_PUBLISH_TOKEN");
	if (!token && !dryRun) {
		console.error("JSR_PUBLISH_TOKEN not set");
		return 1;
	}

	const [graph, packages] = await Promise.all([buildDependencyGraph(), discoverPackages()]);
	const problems = findUnpublishableDeps(graph, packages);
	if (problems.length > 0) {
		for (const problem of problems) console.error(`%c${problem}`, "color: red");
		return 1;
	}

	const { code } = await new Deno.Command("deno", {
		args: [
			"publish",
			...(token ? [`--token=${token}`] : []),
			...(dryRun ? ["--dry-run"] : []),
		],
		cwd: REPO_ROOT,
		stdout: "inherit",
		stderr: "inherit",
	}).output();

	return code;
}

if (import.meta.main) {
	const flags = parseArgs(Deno.args, { boolean: ["dry-run"] });
	Deno.exit(await publishWorkspace(flags["dry-run"]));
}
