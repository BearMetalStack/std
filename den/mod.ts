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
import type { Den, DenDirKind, DenOptions, DenPaths } from "./types.ts";

export * from "./types.ts";
export * from "./errors.ts";
export { DenFileHandle, fileAt } from "./file.ts";
export { DenDirHandle } from "./dir.ts";
export { DIR_KINDS, resolveLayout } from "./layout.ts";
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

	constructor(options: DenOptions) {
		const identity = resolveIdentity(options);
		this.name = identity.name;
		this.org = identity.org;
		this.platform = options.platform ?? hostPlatform();
		this.paths = resolveLayout(identity, this.platform, options.env ?? readEnv);

		const fileOptions = { atomic: options.atomic ?? true };
		this.#dirs = {} as Record<DenDirKind, DenDirHandle>;
		for (const kind of DIR_KINDS) {
			this.#dirs[kind] = new DenDirHandle(this.paths[kind], fileOptions);
		}

		this.config = this.#dirs.config;
		this.data = this.#dirs.data;
		this.cache = this.#dirs.cache;
		this.state = this.#dirs.state;
		this.logs = this.#dirs.logs;
		this.runtime = this.#dirs.runtime;
	}

	dir(kind: DenDirKind): DenDirHandle {
		const dir = this.#dirs[kind];
		if (!dir) throw new RangeError(`unknown directory kind "${kind}"`);
		return dir;
	}

	async ensure(): Promise<this> {
		await Promise.all(DIR_KINDS.map((kind) => this.#dirs[kind].ensure()));
		return this;
	}
}

/**
 * Resolves an application's directories.
 *
 * The app name comes from the first source that has one: the `name` option, the
 * `DEN_APP_NAME`/`DEN_APP` environment variables, then the nearest `den.json`,
 * `deno.json`, `deno.jsonc` or `package.json` walking up from the working
 * directory (a `den` field first, else the package's own `name` with any scope
 * stripped). With none of those, this throws {@linkcode DenConfigError} rather
 * than guessing — a wrong guess writes user data somewhere nobody will find it.
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
