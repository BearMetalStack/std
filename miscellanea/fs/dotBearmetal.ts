import { joinPath } from "@bearmetal/miscellanea";
import { dirname, parse, resolve } from "@std/path";
import type { DotBearmetalDir, DotBearmetalFile, DotBearmetalNamespace } from "@types";
import { ensureDirOf } from "@fs";
import { ensureDir } from "@std/fs/ensure-dir";

// Find an existing .bearmetal dir by walking up from cwd
async function findDotBearmetal(startDir: string): Promise<string | null> {
	let dir = resolve(startDir);
	const { root } = parse(dir);

	while (true) {
		const candidate = joinPath(dir, ".bearmetal");
		try {
			const stat = await Deno.stat(candidate);
			if (stat.isDirectory) return candidate;
		} catch {
			// not found here, keep walking
		}

		if (dir === root) return null;
		dir = dirname(dir);
	}
}

// Determine where .bearmetal *should* live if it doesn't exist yet —
// falls back to deno.json/deno.lock/.git as a "this is a real project" signal
async function resolveProjectRoot(startDir: string): Promise<string> {
	let dir = resolve(startDir);
	const { root } = parse(dir);
	let fallback: string | null = null;

	while (true) {
		for (const marker of ["deno.json", "deno.jsonc", "deno.lock"]) {
			try {
				await Deno.stat(joinPath(dir, marker));
				return dir; // strongest signal, return immediately
			} catch { /* keep looking */ }
		}
		if (fallback === null) {
			try {
				const stat = await Deno.stat(joinPath(dir, ".git"));
				if (stat.isDirectory) fallback = dir;
			} catch { /* keep looking */ }
		}

		if (dir === root) return fallback ?? resolve(startDir); // last resort: cwd itself
		dir = dirname(dir);
	}
}

async function ensureDotBearmetal(startDir: string): Promise<string> {
	const existing = await findDotBearmetal(startDir);
	if (existing) return existing;

	const projectRoot = await resolveProjectRoot(startDir);
	const dir = joinPath(projectRoot, ".bearmetal");
	await Deno.mkdir(dir, { recursive: true });
	return dir;
}

export async function dotBearmetal(namespace: DotBearmetalNamespace): Promise<string> {
	let path = await ensureDotBearmetal(Deno.cwd());
	path = joinPath(path, ...(Array.isArray(namespace) ? namespace : [namespace]));
	return path;
}

// deno-lint-ignore ban-types
export async function dotBearmetalFile<T = {}>(
	namespace: DotBearmetalNamespace,
	fileName: string,
): Promise<DotBearmetalFile<T>> {
	let path = await dotBearmetal(namespace);
	path = joinPath(path, fileName);
	await ensureDirOf(path);
	return {
		path,
		read() {
			try {
				return Deno.readTextFile(path);
			} catch {
				return undefined;
			}
		},
		async readJson<J = T>(): Promise<J> {
			try {
				return JSON.parse(await Deno.readTextFile(path));
			} catch {
				return {} as J;
			}
		},
		write(content: string) {
			return Deno.writeTextFile(path, content, { create: true });
		},
		writeJson<J = T>(content: J) {
			return Deno.writeTextFile(path, JSON.stringify(content, null, "\t"), { create: true });
		},
	};
}

export async function dotBearmetalDir(namespace: DotBearmetalNamespace): Promise<DotBearmetalDir> {
	const path = await dotBearmetal(namespace);
	return {
		read: async () => {
			try {
				return (await Array.fromAsync(Deno.readDir(path)));
			} catch {
				return undefined;
			}
		},
		empty: async () => {
			for await (const entry of Deno.readDir(path)) {
				await Deno.remove(joinPath(path, entry.name), { recursive: true });
			}
		},
		ensure: () => {
			return ensureDir(path);
		},
	};
}
