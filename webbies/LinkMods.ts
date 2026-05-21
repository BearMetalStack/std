#!/usr/bin/env -S deno run --allow-read --allow-write

// link-mods.ts
// Walks a directory tree and ensures every .ts module is imported in the
// nearest ancestor mod.ts. Each mod.ts is itself imported in its nearest
// ancestor mod.ts. Only the generated section (delimited by the markers
// below) is touched — all other content is preserved.

import { walkDir } from "@bearmetal/miscellanea/fs";

const GENERATED_START = "// [GENERATED:link-mods] DO NOT EDIT BELOW";
const GENERATED_END = "// [/GENERATED:link-mods]";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function posixRelative(from: string, to: string): string {
	// Both paths are absolute POSIX-style strings produced by walkDir.
	// Returns a relative path from the directory `from` to the file `to`.
	const fromParts = from.split("/").filter(Boolean);
	const toParts = to.split("/").filter(Boolean);

	let common = 0;
	while (
		common < fromParts.length &&
		common < toParts.length &&
		fromParts[common] === toParts[common]
	) common++;

	const up = fromParts.length - common;
	const down = toParts.slice(common);
	const rel = [...Array(up).fill(".."), ...down].join("/");
	return rel.startsWith(".") ? rel : `./${rel}`;
}

async function readFileOrEmpty(path: string): Promise<string> {
	try {
		return await Deno.readTextFile(path);
	} catch {
		return "";
	}
}

/** Splice the generated block into (or replace it within) existing content. */
function spliceGenerated(existing: string, lines: string[]): string {
	const startIdx = existing.indexOf(GENERATED_START);
	const endIdx = existing.indexOf(GENERATED_END);

	const block = [
		GENERATED_START,
		...lines,
		GENERATED_END,
	].join("\n");

	if (startIdx !== -1 && endIdx !== -1) {
		// Replace the existing generated block (and any whitespace before the
		// start marker that was added by a previous run).
		const before = existing.slice(0, startIdx).trimEnd();
		const after = existing.slice(endIdx + GENERATED_END.length).trimStart();
		const parts = [before, block, after].filter(Boolean);
		return parts.join("\n\n") + "\n";
	}

	// No existing block — append to the end of the file.
	const trimmed = existing.trimEnd();
	return (trimmed ? trimmed + "\n\n" : "") + block + "\n";
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

async function linkMods(root: string): Promise<void> {
	// Resolve to an absolute, canonical path so all subsequent string
	// comparisons are consistent regardless of how the argument was passed
	// (relative, absolute, with trailing slash, with symlinks, etc.).
	root = await Deno.realPath(root);

	// ---- Pass 1: collect every path in the tree ---------------------------
	// We need the full picture before we can decide what goes where.

	const tsFiles = new Map<string, string[]>(); // dir → [file paths]
	const modFiles = new Set<string>(); // absolute paths to mod.ts files

	if (await fileExists(`${root}/mod.ts`)) {
		modFiles.add(`${root}/mod.ts`);
	}

	for await (const entry of walkDir(root)) {
		if (entry.isDirectory) {
			if (await fileExists(`${entry.path}/mod.ts`)) {
				modFiles.add(`${entry.path}/mod.ts`);
			}
		}

		if (
			entry.isFile &&
			entry.name.endsWith(".ts") &&
			entry.name !== "mod.ts" &&
			!entry.name.endsWith(".d.ts") &&
			!entry.name.endsWith(".test.ts") &&
			!entry.name.endsWith(".spec.ts")
		) {
			const dir = entry.path.slice(0, entry.path.lastIndexOf("/"));
			if (!tsFiles.has(dir)) tsFiles.set(dir, []);
			tsFiles.get(dir)!.push(entry.path);
		}
	}

	// ---- Pass 2: assign every file/mod to its nearest ancestor mod.ts -----
	// For each item that needs a home we walk up the directory tree until we
	// find a directory that contains a mod.ts, then register the item there.
	//
	// Items that need a home:
	//   a) Every non-mod .ts file → assigned to nearest ancestor mod.ts.
	//   b) Every mod.ts that is NOT the root mod → assigned to the nearest
	//      ancestor mod.ts above its own directory (so mod.ts files bubble up
	//      exactly one level at a time through the chain).

	// modDir → set of file paths to import from that mod
	const assignments = new Map<string, Set<string>>();
	for (const modPath of modFiles) {
		const dir = modPath.slice(0, modPath.lastIndexOf("/"));
		assignments.set(dir, new Set());
	}

	/** Walk up from `startDir` (inclusive) and return the dir of the nearest
	 *  mod.ts, never climbing above `root`. Returns null only if root itself
	 *  has no mod.ts (which the pre-flight guard above already ensures). */
	function nearestModDir(startDir: string): string | null {
		let cur = startDir;
		while (true) {
			if (modFiles.has(`${cur}/mod.ts`)) return cur;
			if (cur === root) return null; // hit the ceiling with no mod found
			cur = cur.slice(0, cur.lastIndexOf("/"));
		}
	}

	// (a) Non-mod .ts files — start search from their own directory.
	for (const [dir, files] of tsFiles) {
		const home = nearestModDir(dir);
		if (home === null) {
			console.warn(
				`warn     no mod.ts ancestor found for files in ${dir}, skipping`,
			);
			continue;
		}
		for (const filePath of files) {
			assignments.get(home)!.add(filePath);
		}
	}

	// (b) Child mod.ts files — start search one level above their own dir.
	for (const modPath of modFiles) {
		const modDir = modPath.slice(0, modPath.lastIndexOf("/"));
		if (modDir === root) continue; // root mod has no parent to bubble up to

		const parentDir = modDir.slice(0, modDir.lastIndexOf("/"));
		const home = nearestModDir(parentDir);
		if (home === null) {
			console.warn(
				`warn     no mod.ts ancestor found above ${modPath}, skipping`,
			);
			continue;
		}
		assignments.get(home)!.add(modPath);
	}

	// ---- Pass 3: write each mod.ts ------------------------------------------

	for (const [modDir, imports] of assignments) {
		const modPath = `${modDir}/mod.ts`;
		const importLines = [...imports]
			.sort()
			.map((filePath) => `export * from "${posixRelative(modDir, filePath)}";`);

		const existing = await readFileOrEmpty(modPath);
		const updated = spliceGenerated(existing, [
			'import "@style"',
			...importLines,
		]);

		if (updated !== existing) {
			await Deno.writeTextFile(modPath, updated);
			console.log(`updated  ${modPath}`);
		} else {
			console.log(`no-op    ${modPath}`);
		}
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const stat = await Deno.stat(path);
		return stat.isFile;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

const targetDir = Deno.args[0] ?? ".";
await linkMods(targetDir);
