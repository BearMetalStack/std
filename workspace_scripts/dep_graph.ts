/**
 * Builds the internal `@bearmetal/*` dependency graph by scanning package
 * sources for import specifiers.
 *
 * Source scanning rather than `deno.json` parsing because internal deps are
 * written as bare `jsr:@bearmetal/<pkg>` specifiers resolved by the workspace,
 * so they never appear in a package's `imports` map.
 */

import {
	discoverPackages,
	extractSpecifiers,
	SCOPE,
	type ScopeString,
	sourceFiles,
	specifierToPackage,
	type WorkspacePackage,
} from "./workspace.ts";

/** Maps each package name to the workspace packages it imports. */
export type DependencyGraph = Map<string, string[]>;

/** Collects the in-workspace packages that `pkg` imports, excluding itself. */
async function packageDependencies(
	pkg: WorkspacePackage,
	known: ReadonlySet<string>,
	nested: Iterable<string>,
	scope: ScopeString,
): Promise<string[]> {
	const deps = new Set<string>();

	for await (const file of sourceFiles(pkg, nested)) {
		const source = await Deno.readTextFile(file);
		for (const specifier of extractSpecifiers(source)) {
			const dep = specifierToPackage(specifier, scope);
			// Ignore self-imports and anything that is not a workspace member,
			// so the graph never grows a node we cannot build or publish.
			if (dep && dep !== pkg.name && known.has(dep)) deps.add(dep);
		}
	}

	return [...deps].sort();
}

/** Builds the full internal dependency graph, in stable name order. */
export async function buildDependencyGraph(
	scope: ScopeString = SCOPE,
): Promise<DependencyGraph> {
	const packages = await discoverPackages(scope);
	const known = new Set(packages.map((p) => p.name));

	const entries = await Promise.all(
		packages.map(async (pkg) => {
			// Any package whose directory sits under this one is its own unit.
			const nested = packages
				.filter((other) => other !== pkg && other.path.startsWith(`${pkg.path}/`))
				.map((other) => other.path);
			return [pkg.name, await packageDependencies(pkg, known, nested, scope)] as const;
		}),
	);

	return new Map(entries);
}

/**
 * Returns every dependency cycle in the graph, each as the list of packages
 * involved (first element repeated at the end to close the loop).
 *
 * Iterative three-colour DFS: linear in the size of the graph, and it reports
 * each cycle once rather than once per entry point.
 */
export function findCycles(graph: DependencyGraph): string[][] {
	const WHITE = 0, GREY = 1, BLACK = 2;
	const colour = new Map<string, number>();
	const stack: string[] = [];
	const cycles: string[][] = [];
	const seen = new Set<string>();

	function visit(node: string): void {
		colour.set(node, GREY);
		stack.push(node);

		for (const dep of graph.get(node) ?? []) {
			const state = colour.get(dep) ?? WHITE;
			if (state === WHITE) {
				visit(dep);
			} else if (state === GREY) {
				// `dep` is on the current stack, so we closed a loop.
				const cycle = [...stack.slice(stack.indexOf(dep)), dep];
				// Canonicalise so the same loop found from two entry points dedupes.
				const key = [...cycle.slice(0, -1)].sort().join(">");
				if (!seen.has(key)) {
					seen.add(key);
					cycles.push(cycle);
				}
			}
		}

		stack.pop();
		colour.set(node, BLACK);
	}

	for (const node of graph.keys()) {
		if ((colour.get(node) ?? WHITE) === WHITE) visit(node);
	}

	return cycles;
}

/**
 * Orders packages so every package appears after all of its dependencies.
 *
 * Throws when the graph contains a cycle - callers that want to report the
 * cycles first should call {@linkcode findCycles}.
 */
export function topoSort(graph: DependencyGraph): string[] {
	const indegree = new Map<string, number>();
	const dependents = new Map<string, string[]>();

	for (const node of graph.keys()) {
		indegree.set(node, 0);
		dependents.set(node, []);
	}
	for (const [node, deps] of graph) {
		indegree.set(node, deps.length);
		for (const dep of deps) dependents.get(dep)?.push(node);
	}

	// Sorted seed and sorted insertion keep the output deterministic.
	const ready = [...indegree].filter(([, n]) => n === 0).map(([name]) => name).sort();
	const ordered: string[] = [];

	while (ready.length > 0) {
		const node = ready.shift()!;
		ordered.push(node);
		for (const dependent of dependents.get(node) ?? []) {
			const remaining = indegree.get(dependent)! - 1;
			indegree.set(dependent, remaining);
			if (remaining === 0) {
				ready.push(dependent);
				ready.sort();
			}
		}
	}

	if (ordered.length !== graph.size) {
		throw new Error("dependency graph contains a cycle; cannot topologically sort");
	}
	return ordered;
}

if (import.meta.main) {
	const graph = await buildDependencyGraph();

	for (const name of topoSortOrPrintCycles(graph)) {
		const deps = graph.get(name) ?? [];
		console.log(`${name}${deps.length ? `\n  ${deps.join("\n  ")}` : "  (no internal deps)"}`);
	}
}

/** Prints cycles and exits non-zero, otherwise returns the sorted order. */
function topoSortOrPrintCycles(graph: DependencyGraph): string[] {
	const cycles = findCycles(graph);
	if (cycles.length === 0) return topoSort(graph);

	for (const cycle of cycles) {
		console.error(`%ccircular dependency: ${cycle.join(" → ")}`, "color: red");
	}
	Deno.exit(1);
}
