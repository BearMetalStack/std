/**
 * Ties a docs package (`packages/<id>/`) to the code it documents, with no manifest: the nearest
 * Deno workspace above the content directory is read, and `<id>` is matched against its members.
 * The match gives the docs a published name and a current version, which is how the generators
 * know which version directory an edit belongs in.
 */

import { basename, dirname, join, resolve } from "@std/path";
import { expandGlob } from "@std/fs";

/** One package in the workspace. */
export interface WorkspaceMember {
	/** Published name, e.g. `@bearmetal/router`. */
	name: string;
	/** `version` from its `deno.json`, if it has one. */
	version?: string;
	/** Absolute directory. */
	dir: string;
}

/** The workspace the content belongs to. */
export interface Workspace {
	root: string;
	members: WorkspaceMember[];
}

/** How a package version maps onto a docs version directory. */
export type VersionScheme = "major" | "minor" | "exact";

async function readConfig(dir: string): Promise<Record<string, unknown> | null> {
	for (const file of ["deno.json", "deno.jsonc"]) {
		try {
			const text = await Deno.readTextFile(join(dir, file));
			return JSON.parse(file.endsWith("c") ? stripComments(text) : text);
		} catch (e) {
			if (e instanceof Deno.errors.NotFound) continue;
			if (e instanceof SyntaxError) return null;
			throw e;
		}
	}
	return null;
}

function stripComments(text: string): string {
	return text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s) => s ?? "");
}

function member(dir: string, config: Record<string, unknown>): WorkspaceMember | null {
	if (typeof config.name !== "string") return null;
	return {
		name: config.name,
		version: typeof config.version === "string" ? config.version : undefined,
		dir,
	};
}

/**
 * The nearest `deno.json` above `from` that declares a `workspace` (its members) or a `name` (a
 * single-package project). `null` when there is neither.
 */
export async function findWorkspace(from: string): Promise<Workspace | null> {
	let dir = resolve(from);
	let single: Workspace | null = null;
	while (true) {
		const config = await readConfig(dir);
		if (config && Array.isArray(config.workspace)) {
			const members: WorkspaceMember[] = [];
			for (const pattern of config.workspace) {
				if (typeof pattern !== "string") continue;
				for await (const e of expandGlob(pattern, { root: dir, includeDirs: true })) {
					if (!e.isDirectory) continue;
					const c = await readConfig(e.path);
					const m = c && member(e.path, c);
					if (m) members.push(m);
				}
			}
			return { root: dir, members };
		}
		if (config && !single) {
			const m = member(dir, config);
			if (m) single = { root: dir, members: [m] };
		}
		const up = dirname(dir);
		if (up === dir) return single;
		dir = up;
	}
}

/**
 * The member a docs package documents: the one named by `override` (`package:` in the package's
 * `index.md`), else one whose name ends in `/<id>`, else one whose directory is called `<id>`.
 */
export function linkPackage(
	workspace: Workspace | null,
	id: string,
	override?: string,
): WorkspaceMember | undefined {
	const members = workspace?.members ?? [];
	if (override) return members.find((m) => m.name === override);
	return members.find((m) => m.name === id || m.name.endsWith(`/${id}`)) ??
		members.find((m) => basename(m.dir) === id);
}

/** The docs version directory for a package version: `0.3.2` → `0.3` under `minor`. */
export function docsVersion(version: string, scheme: VersionScheme = "minor"): string {
	const clean = version.replace(/^v/, "");
	if (scheme === "exact") return clean;
	const [major = "0", minor = "0"] = clean.split(/[-+]/)[0].split(".");
	return scheme === "major" ? major : `${major}.${minor}`;
}

/** Whether `dir` is a version directory name `scheme` would produce. */
export function fitsScheme(dir: string, scheme: VersionScheme = "minor"): boolean {
	const clean = dir.replace(/^v/, "");
	if (scheme === "major") return /^\d+$/.test(clean);
	if (scheme === "minor") return /^\d+\.\d+$/.test(clean);
	return /^\d+\.\d+\.\d+([-+][\w.]+)?$/.test(clean);
}

/** Orders versions numerically, part by part; `0.10` sorts after `0.9`. */
export function compareVersions(a: string, b: string): number {
	const pa = a.replace(/^v/, "").split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
	const pb = b.replace(/^v/, "").split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x === y) continue;
		if (typeof x === "number" && typeof y === "number") return x - y;
		return String(x) < String(y) ? -1 : 1;
	}
	return 0;
}
