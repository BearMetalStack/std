/**
 * @module
 * OS-correct application directories, and dead-simple handles for the files in
 * them.
 *
 * ```ts
 * import { den } from "@bearmetal/den";
 *
 * const app = den({ name: "myapp" });
 *
 * const settings = app.config.file("settings.json");
 * const current = await settings.readJson({ theme: "dark" });
 * await settings.writeJson({ ...current, theme: "light" });
 * ```
 *
 * `den()` is synchronous and touches nothing on disk — it only resolves paths.
 * Directories are created lazily, when something is actually written.
 *
 * See {@link ./layout.ts} for the per-platform layout tables.
 */

import { DenDirHandle } from "./dir.ts";
import { readEnv } from "./env.ts";
import { resolveIdentity } from "./identity.ts";
import { DIR_KINDS, resolveLayout } from "./layout.ts";
import { hostPlatform } from "./paths.ts";
import type { Den, DenDirKind, DenOptions, DenOwnership, DenPaths, DenWarning } from "./types.ts";

export * from "./types.ts";
export * from "./errors.ts";
export { DenFileHandle, fileAt } from "./file.ts";
export { DenDirHandle } from "./dir.ts";
export type { DirOptions, DirOwnership } from "./dir.ts";
export { DIR_KINDS, resolveLayout } from "./layout.ts";
export { inspect, MARKER, MARKER_VERSION, readOwner } from "./marker.ts";
export { compiledAncestors, compiledEntryModule, isCompiled } from "./compiled.ts";
export {
	clearDiscoveryCache,
	DEFAULT_ENV_PREFIX,
	discoverIdentity,
	parseJsonish,
	resolveIdentity,
} from "./identity.ts";
export { firstEnv, readEnv } from "./env.ts";
export { hostPlatform, joinFor, joinSegments } from "./paths.ts";

/** Implementation of {@linkcode Den}. */
class DenApp implements Den {
	readonly name: string;
	readonly org?: string;
	readonly platform: Den["platform"];
	readonly paths: DenPaths;

	readonly config: DenDirHandle;
	readonly data: DenDirHandle;
	readonly cache: DenDirHandle;
	readonly state: DenDirHandle;
	readonly logs: DenDirHandle;
	readonly runtime: DenDirHandle;

	readonly #dirs: Record<DenDirKind, DenDirHandle>;
	readonly #warn: (warning: DenWarning) => void;

	constructor(options: DenOptions) {
		const identity = resolveIdentity(options);
		this.name = identity.name;
		this.org = identity.org;
		this.platform = options.platform ?? hostPlatform();
		this.paths = resolveLayout(identity, this.platform, options.env ?? readEnv);
		this.#warn = options.onWarning ?? defaultWarn;

		const shared = { atomic: options.atomic ?? true };
		this.#dirs = {} as Record<DenDirKind, DenDirHandle>;
		for (const kind of DIR_KINDS) {
			this.#dirs[kind] = new DenDirHandle(this.paths[kind], {
				...shared,
				ownership: { app: this.name, org: this.org, kind },
			});
		}

		this.config = this.#dirs.config;
		this.data = this.#dirs.data;
		this.cache = this.#dirs.cache;
		this.state = this.#dirs.state;
		this.logs = this.#dirs.logs;
		this.runtime = this.#dirs.runtime;

		for (const warning of collisions(this.paths)) this.#warn(warning);
	}

	dir(kind: DenDirKind): DenDirHandle {
		const dir = this.#dirs[kind];
		if (!dir) throw new RangeError(`unknown directory kind "${kind}"`);
		return dir;
	}

	inspect(): Promise<DenOwnership[]> {
		return Promise.all(DIR_KINDS.map((kind) => this.#dirs[kind].inspect()));
	}

	/**
	 * Bootstrap. Checks what is already at each path, says something if it looks
	 * like it belongs to somebody else, then creates and claims the directories
	 * that are free.
	 */
	async ensure(): Promise<this> {
		for (const report of await this.inspect()) {
			if (report.status === "conflict" || report.status === "unclaimed") {
				this.#warn({
					code: report.status,
					message: report.message ?? `${report.path} is not this app's ${report.kind} directory`,
					kinds: [report.kind],
					path: report.path,
				});
			}
			// A conflict is left strictly alone -- not created, not claimed, not
			// written to. Whatever is there belongs to someone else.
			if (report.status === "conflict") continue;
			await this.#dirs[report.kind].claim();
		}
		return this;
	}
}

/**
 * Two kinds landing on one path, found without touching the disk. A `dirs`
 * override or a hand-set `BEARMETAL_DEN_*_DIR` is all it takes, and the symptom — a cache
 * clear wiping the user's config — arrives much later than the cause.
 */
function collisions(paths: DenPaths): DenWarning[] {
	const seen = new Map<string, DenDirKind[]>();
	for (const kind of DIR_KINDS) {
		const key = paths[kind];
		const kinds = seen.get(key);
		if (kinds) kinds.push(kind);
		else seen.set(key, [kind]);
	}

	return [...seen.entries()]
		.filter(([, kinds]) => kinds.length > 1)
		.map(([path, kinds]) => ({
			code: "collision" as const,
			message: `${kinds.join(" and ")} both resolve to ${path}`,
			kinds,
			path,
		}));
}

function defaultWarn(warning: DenWarning): void {
	console.warn(`[den] ${warning.message}`);
}

/**
 * Resolves an application's directories.
 *
 * The app name comes from the first source that has one: the `name` option, the
 * `BEARMETAL_DEN_APP_NAME`/`BEARMETAL_DEN_APP` environment variables, then the nearest `den.json`,
 * `deno.json`, `deno.jsonc` or `package.json` walking up from the working
 * directory (a `den` field first, else the package's own `name` with any scope
 * stripped). With none of those, this throws {@linkcode DenConfigError} rather
 * than guessing — a wrong guess writes user data somewhere nobody will find it.
 *
 * Inside a `deno compile` binary the config-file search covers the binary's
 * embedded file system only, so a config file has to have been `--include`d to
 * be found. See {@link ./identity.ts} for why the host's is off limits.
 *
 * Nothing here is async and nothing here touches the file system beyond reading
 * a config file, so it is fine to call per request, per module, or in a hot
 * loop; handles are cheap.
 *
 * @param options Identity and layout overrides. All optional.
 */
export function den(options: DenOptions = {}): Den {
	return new DenApp(options);
}

export default den;
