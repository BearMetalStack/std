/**
 * An in-memory model of the routes directory, read once up front so the planner
 * can be a pure function of it.
 *
 * The generator only ever reasons about files that follow its own convention —
 * a `<segment>.ts` leaf, or a `<segment>/` directory with a `mod.ts` parent. A
 * `router.route("/api/banner")` written by hand somewhere else is not a node in
 * this tree and is never touched.
 *
 * @module
 */

import { joinPath } from "@bearmetal/miscellanea";
import { readTextIfPresent } from "@bearmetal/miscellanea/fs";
import { fileNameToSegment, moduleFnName, ownRoutePath } from "./path.ts";

/** What a node is on disk. */
export type NodeKind = "root" | "leaf" | "parent" | "absent";

/** One node in the routes tree — a path segment and the file(s) behind it. */
export interface RouteNode {
	/** The path segment, e.g. `"api"`, `":id"`. Empty for the root. */
	segment: string;
	/** Full route path from the root, e.g. `"/api/users"`. `"/"` for the root. */
	routePath: string;
	/** The route path this node declares for itself, e.g. `"/users"`. */
	ownPath: string;
	/** Exported factory name, e.g. `"usersModule"`. Empty for the root. */
	fnName: string;
	/** Directory that holds this node's children (its own dir when a parent). */
	dir: string;
	/** Absolute path of this node's own file (`mod.ts` or `<segment>.ts`), if any. */
	file: string | null;
	kind: NodeKind;
	/** Source of {@link file}, when it exists. */
	contents?: string;
	/** Children keyed by segment. */
	children: Map<string, RouteNode>;
}

/** Reads the routes directory into a {@link RouteNode} tree rooted at `routesDir`. */
export async function loadTree(routesDir: string): Promise<RouteNode> {
	const rootFile = joinPath(routesDir, "mod.ts");
	const root: RouteNode = {
		segment: "",
		routePath: "/",
		ownPath: "/",
		fnName: "",
		dir: routesDir,
		file: (await readTextIfPresent(rootFile)) !== undefined ? rootFile : null,
		kind: "root",
		children: new Map(),
	};
	if (root.file) root.contents = await readTextIfPresent(root.file);
	root.children = await loadChildren(routesDir, "");
	return root;
}

async function loadChildren(dir: string, parentPath: string): Promise<Map<string, RouteNode>> {
	const children = new Map<string, RouteNode>();
	let entries: Deno.DirEntry[];
	try {
		entries = await Array.fromAsync(Deno.readDir(dir));
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) return children;
		throw e;
	}

	const dirs = new Set(entries.filter((e) => e.isDirectory).map((e) => e.name));

	for (const entry of entries) {
		if (entry.isDirectory) {
			const segment = fileNameToSegment(entry.name);
			const nodeDir = joinPath(dir, entry.name);
			const modFile = joinPath(nodeDir, "mod.ts");
			const node = await makeNode(segment, parentPath, dir, {
				kind: "parent",
				dir: nodeDir,
				file: (await readTextIfPresent(modFile)) !== undefined ? modFile : null,
			});
			node.children = await loadChildren(nodeDir, node.routePath);
			children.set(segment, node);
			continue;
		}
		if (!entry.isFile || !entry.name.endsWith(".ts") || entry.name === "mod.ts") continue;
		const segment = fileNameToSegment(entry.name);
		if (dirs.has(segmentDirName(entry.name))) continue;
		const node = await makeNode(segment, parentPath, dir, {
			kind: "leaf",
			dir,
			file: joinPath(dir, entry.name),
		});
		children.set(segment, node);
	}

	return children;
}

/**
 * The directory name a leaf file would share a segment with. A `users.ts` beside
 * a `users/` directory is the stray remains of a promotion: the directory wins
 * and the file is skipped rather than double-registering the segment.
 */
function segmentDirName(fileName: string): string {
	return fileName.replace(/\.ts$/, "");
}

async function makeNode(
	segment: string,
	parentPath: string,
	parentDir: string,
	partial: { kind: NodeKind; dir: string; file: string | null },
): Promise<RouteNode> {
	const routePath = joinPath(parentPath || "/", segment) || "/";
	const node: RouteNode = {
		segment,
		routePath: routePath.startsWith("/") ? routePath : "/" + routePath,
		ownPath: ownRoutePath(segment),
		fnName: moduleFnName(segment),
		dir: partial.dir,
		file: partial.file,
		kind: partial.kind,
		children: new Map(),
	};
	void parentDir;
	if (node.file) node.contents = await readTextIfPresent(node.file);
	return node;
}
