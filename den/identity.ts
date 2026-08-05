/**
 * @module
 * Working out who the app is, from three sources in a fixed order: what the
 * caller passed, the environment, then the nearest config file. The last one is
 * what makes `den()` with no arguments work at all — in a Deno project the app
 * already has a name, and it's sitting in `deno.json`.
 */

import { DenConfigError } from "./errors.ts";
import { compiledAncestors, isCompiled } from "./compiled.ts";
import { firstEnv, readEnv } from "./env.ts";
import { DIR_KINDS } from "./layout.ts";
import type { DenDirKind, DenIdentity, DenOptions, EnvReader } from "./types.ts";

/** Config files den will read, most specific first within a directory. */
const CONFIG_FILES = ["den.json", "den.jsonc", "deno.json", "deno.jsonc", "package.json"] as const;

/** Default prefix for every environment variable den reads. */
export const DEFAULT_ENV_PREFIX = "DEN";

/**
 * JSON with the two things `deno.jsonc` allows and `JSON.parse` doesn't:
 * comments and trailing commas. String literals are tracked so a `//` inside a
 * path or a URL survives.
 */
export function parseJsonish<T = unknown>(text: string): T | undefined {
	let out = "";
	let inString = false;
	let escaped = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (inString) {
			out += char;
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === '"') inString = false;
			continue;
		}

		if (char === '"') {
			inString = true;
			out += char;
			continue;
		}
		if (char === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			out += "\n";
			continue;
		}
		if (char === "/" && text[i + 1] === "*") {
			i += 2;
			while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
			i++;
			continue;
		}
		out += char;
	}

	try {
		return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")) as T;
	} catch {
		return undefined;
	}
}

function readFileSync(path: string | URL): string | undefined {
	try {
		return Deno.readTextFileSync(path);
	} catch {
		return undefined;
	}
}

/** `@scope/name` and `name` both name an app `name`. */
function bareName(name: string): string {
	const at = name.startsWith("@") ? name.slice(1) : name;
	const slash = at.lastIndexOf("/");
	return slash === -1 ? at : at.slice(slash + 1);
}

function pickIdentity(value: unknown): Partial<DenIdentity> | undefined {
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	const identity: Partial<DenIdentity> = {};

	if (typeof record.name === "string" && record.name.trim()) identity.name = record.name.trim();
	if (typeof record.org === "string" && record.org.trim()) identity.org = record.org.trim();
	if (typeof record.home === "string" && record.home.trim()) identity.home = record.home.trim();

	if (record.dirs && typeof record.dirs === "object") {
		const dirs: Partial<Record<DenDirKind, string>> = {};
		for (const kind of DIR_KINDS) {
			const dir = (record.dirs as Record<string, unknown>)[kind];
			if (typeof dir === "string" && dir.trim()) dirs[kind] = dir.trim();
		}
		if (Object.keys(dirs).length) identity.dirs = dirs;
	}

	return Object.keys(identity).length ? identity : undefined;
}

/**
 * Reads one config file. A `den` field wins outright; failing that, a top-level
 * `name` is taken as the app name, which is the deno.json/package.json case.
 */
function identityFromFile(
	location: string | URL,
	fileName: string,
): Partial<DenIdentity> | undefined {
	const text = readFileSync(location);
	if (text === undefined) return undefined;

	const parsed = parseJsonish<Record<string, unknown>>(text);
	if (!parsed || typeof parsed !== "object") return undefined;

	const explicit = pickIdentity(parsed.den);
	if (explicit) return explicit;

	// den.json *is* the den config; elsewhere only the package name is ours to take
	if (fileName === "den.json" || fileName === "den.jsonc") {
		const own = pickIdentity(parsed);
		if (own) return own;
	}
	if (typeof parsed.name === "string" && parsed.name.trim()) {
		return { name: bareName(parsed.name.trim()) };
	}
	return undefined;
}

/** The first config file in `dir` that names an app. */
function identityIn(dir: string | URL): DenIdentity | undefined {
	for (const file of CONFIG_FILES) {
		const location = typeof dir === "string"
			? `${dir.replace(/[\\/]+$/, "")}/${file}`
			: new URL(file, dir);
		const identity = identityFromFile(location, file);
		if (identity?.name) return identity as DenIdentity;
	}
	return undefined;
}

const discoveryCache = new Map<string, DenIdentity | null>();

/**
 * Walks up from `cwd` for the nearest config file that names an app.
 *
 * **Inside a compiled binary this searches the embedded file system instead**,
 * never the real one. `Deno.cwd()` in a compiled binary is wherever the user
 * happened to run the executable, so walking it means a binary started inside
 * an unrelated project adopts *that* project's name and writes its data
 * somewhere nobody will find it. The embedded walk is bounded by the virtual
 * root, so it can't step out into the host filesystem either.
 *
 * The catch, and it is worth knowing: `deno compile` embeds the module graph,
 * and a config file is not a module. Unless it was passed to
 * `--include`, there is nothing to find, and a compiled binary should name
 * itself explicitly with `den({ name })` or the `DEN_APP_NAME` environment
 * variable.
 *
 * Memoised per starting directory — the walk is cheap, but `den()` is meant to
 * be callable anywhere without thinking about it.
 */
export function discoverIdentity(cwd: string): DenIdentity | undefined {
	const bounds = compiledAncestors();
	const key = bounds.length ? `compiled:${bounds[0].href}` : cwd;

	const cached = discoveryCache.get(key);
	if (cached !== undefined) return cached ?? undefined;

	const found = bounds.length ? discoverEmbedded(bounds) : discoverFromCwd(cwd);
	discoveryCache.set(key, found ?? null);
	return found;
}

function discoverEmbedded(ancestors: URL[]): DenIdentity | undefined {
	for (const dir of ancestors) {
		const identity = identityIn(dir);
		if (identity) return identity;
	}
	return undefined;
}

function discoverFromCwd(cwd: string): DenIdentity | undefined {
	let dir = cwd;

	while (true) {
		const identity = identityIn(dir);
		if (identity) return identity;

		const stripped = dir.replace(/[\\/][^\\/]*$/, "");
		const parent = stripped === "" && dir.startsWith("/") ? "/" : stripped;
		if (!parent || parent === dir) return undefined;
		dir = parent;
	}
}

/** Clears the config-file discovery cache. Mostly here for tests. */
export function clearDiscoveryCache(): void {
	discoveryCache.clear();
}

function identityFromEnv(env: EnvReader, prefix: string): Partial<DenIdentity> | undefined {
	const identity: Partial<DenIdentity> = {};
	const name = firstEnv(env, `${prefix}_APP_NAME`, `${prefix}_APP`);
	if (name) identity.name = name;

	const org = env(`${prefix}_ORG`);
	if (org) identity.org = org;

	const home = env(`${prefix}_HOME`);
	if (home) identity.home = home;

	const dirs: Partial<Record<DenDirKind, string>> = {};
	for (const kind of DIR_KINDS) {
		const dir = env(`${prefix}_${kind.toUpperCase()}_DIR`);
		if (dir) dirs[kind] = dir;
	}
	if (Object.keys(dirs).length) identity.dirs = dirs;

	return Object.keys(identity).length ? identity : undefined;
}

function assertUsableName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) throw new DenConfigError("application name is empty");
	if (/[\\/\0]/.test(trimmed)) {
		throw new DenConfigError(
			`application name "${name}" contains a path separator; it names one directory, not several`,
		);
	}
	if (trimmed === "." || trimmed === "..") {
		throw new DenConfigError(`application name "${name}" is not a usable directory name`);
	}
	return trimmed;
}

/**
 * Merges the three sources into one identity. Fields are taken independently,
 * so an app name from `deno.json` composes with a `DEN_HOME` from the
 * environment and a `dirs.cache` from the call site.
 */
export function resolveIdentity(options: DenOptions = {}): DenIdentity {
	const env = options.env ?? readEnv;
	const prefix = options.envPrefix ?? DEFAULT_ENV_PREFIX;

	const layers: (Partial<DenIdentity> | undefined)[] = [
		pickIdentity(options),
		identityFromEnv(env, prefix),
	];

	if (options.discover !== false) {
		const cwd = options.cwd ?? safeCwd();
		if (cwd) layers.push(discoverIdentity(cwd));
	}

	const merged: Partial<DenIdentity> = {};
	for (const layer of layers) {
		if (!layer) continue;
		merged.name ??= layer.name;
		merged.org ??= layer.org;
		merged.home ??= layer.home;
		if (layer.dirs) merged.dirs = { ...layer.dirs, ...merged.dirs };
	}

	if (!merged.name) {
		// Inside a binary the usual "check your deno.json" advice is a dead end:
		// the config file is only there if it was compiled in.
		throw new DenConfigError(
			isCompiled()
				? `den could not determine the application name. This is a compiled binary, so the ` +
					`config-file search only looks inside the binary's embedded file system — a ` +
					`deno.json on the host is deliberately ignored. Pass a name — den({ name: "myapp" }) ` +
					`— or set ${prefix}_APP_NAME, or rebuild with \`deno compile --include den.json\`.`
				: `den could not determine the application name. Pass one — den({ name: "myapp" }) — ` +
					`or set ${prefix}_APP_NAME, or give the nearest deno.json a "name" or a ` +
					`"den": { "name": ... } field.`,
		);
	}

	return { ...merged, name: assertUsableName(merged.name) } as DenIdentity;
}

function safeCwd(): string | undefined {
	try {
		return Deno.cwd();
	} catch {
		return undefined;
	}
}
