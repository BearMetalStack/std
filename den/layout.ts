/**
 * @module
 * The OS layouts. This is the whole point of the package: one table of "where
 * does this kind of thing live", per platform, so nothing downstream has to
 * think about `~/.config` versus `%APPDATA%` ever again.
 *
 * ## Linux and friends — XDG Base Directory
 *
 * | kind    | path                                                |
 * | ------- | --------------------------------------------------- |
 * | config  | `$XDG_CONFIG_HOME`, else `~/.config`, `/<app>`      |
 * | data    | `$XDG_DATA_HOME`, else `~/.local/share`, `/<app>`   |
 * | cache   | `$XDG_CACHE_HOME`, else `~/.cache`, `/<app>`        |
 * | state   | `$XDG_STATE_HOME`, else `~/.local/state`, `/<app>`  |
 * | logs    | `<state>/logs`                                      |
 * | runtime | `$XDG_RUNTIME_DIR`, else `$TMPDIR`, else `/tmp`     |
 *
 * `org` is ignored, because XDG has no notion of a vendor directory.
 *
 * ## macOS
 *
 * | kind    | path                                       |
 * | ------- | ------------------------------------------ |
 * | config  | `~/Library/Preferences/<bundle>`           |
 * | data    | `~/Library/Application Support/<bundle>`   |
 * | cache   | `~/Library/Caches/<bundle>`                |
 * | state   | `~/Library/Application Support/<bundle>/state` |
 * | logs    | `~/Library/Logs/<bundle>`                  |
 * | runtime | `$TMPDIR`, else `/tmp`, `/<bundle>`        |
 *
 * `bundle` is `<org>.<app>` when an org was given, else `<app>`.
 *
 * ## Windows
 *
 * | kind    | path                                    |
 * | ------- | --------------------------------------- |
 * | config  | `%APPDATA%\<vendor>\config`             |
 * | data    | `%APPDATA%\<vendor>\data`               |
 * | cache   | `%LOCALAPPDATA%\<vendor>\cache`         |
 * | state   | `%LOCALAPPDATA%\<vendor>\state`         |
 * | logs    | `%LOCALAPPDATA%\<vendor>\logs`          |
 * | runtime | `%TEMP%\<vendor>`                       |
 *
 * `vendor` is `<org>\<app>` when an org was given, else `<app>`. Config and
 * data are roaming; cache, state and logs are local, because none of them are
 * worth pushing across a roaming profile.
 */

import { DenEnvError } from "./errors.ts";
import { firstEnv } from "./env.ts";
import { isAbsoluteFor, joinFor } from "./paths.ts";
import type { DenDirKind, DenIdentity, DenPaths, DenPlatform, EnvReader } from "./types.ts";

/** Every directory kind, in a stable order. */
export const DIR_KINDS: readonly DenDirKind[] = [
	"config",
	"data",
	"cache",
	"state",
	"logs",
	"runtime",
] as const;

/**
 * The user's home directory. Windows prefers `%USERPROFILE%` and falls back to
 * the `%HOMEDRIVE%%HOMEPATH%` pair that predates it; everything else is `$HOME`.
 */
function homeDir(env: EnvReader, platform: DenPlatform): string {
	if (platform === "windows") {
		const profile = env("USERPROFILE");
		if (profile) return profile;
		const drive = env("HOMEDRIVE");
		const path = env("HOMEPATH");
		if (drive && path) return drive + path;
	} else {
		const home = env("HOME");
		if (home) return home;
	}
	throw new DenEnvError(
		`could not determine the home directory on ${platform}; set ${
			platform === "windows" ? "USERPROFILE" : "HOME"
		}, or pass \`home\` to den()`,
	);
}

/**
 * An XDG variable, honoured only when absolute — the spec says a relative value
 * is invalid and must be treated as unset, and a relative `$XDG_CONFIG_HOME`
 * would otherwise scatter config wherever the process happened to be started.
 */
function xdg(env: EnvReader, key: string, platform: DenPlatform): string | undefined {
	const value = env(key);
	return value && isAbsoluteFor(platform, value) ? value : undefined;
}

function tempDir(env: EnvReader, platform: DenPlatform): string {
	if (platform === "windows") {
		return firstEnv(env, "TEMP", "TMP") ??
			joinFor(platform, homeDir(env, platform), "AppData", "Local", "Temp");
	}
	return firstEnv(env, "TMPDIR", "TMP") ?? "/tmp";
}

function xdgPaths(env: EnvReader, platform: DenPlatform, name: string): DenPaths {
	const home = () => homeDir(env, platform);
	const join = (base: string, ...rest: string[]) => joinFor(platform, base, ...rest);

	const config = join(xdg(env, "XDG_CONFIG_HOME", platform) ?? join(home(), ".config"), name);
	const data = join(xdg(env, "XDG_DATA_HOME", platform) ?? join(home(), ".local", "share"), name);
	const cache = join(xdg(env, "XDG_CACHE_HOME", platform) ?? join(home(), ".cache"), name);
	const state = join(xdg(env, "XDG_STATE_HOME", platform) ?? join(home(), ".local", "state"), name);
	const runtimeBase = xdg(env, "XDG_RUNTIME_DIR", platform) ?? tempDir(env, platform);

	return {
		config,
		data,
		cache,
		state,
		logs: join(state, "logs"),
		runtime: join(runtimeBase, name),
	};
}

function darwinPaths(env: EnvReader, platform: DenPlatform, bundle: string): DenPaths {
	const library = joinFor(platform, homeDir(env, platform), "Library");
	const join = (base: string, ...rest: string[]) => joinFor(platform, base, ...rest);
	const support = join(library, "Application Support", bundle);

	return {
		config: join(library, "Preferences", bundle),
		data: support,
		cache: join(library, "Caches", bundle),
		state: join(support, "state"),
		logs: join(library, "Logs", bundle),
		runtime: join(tempDir(env, platform), bundle),
	};
}

function windowsPaths(env: EnvReader, platform: DenPlatform, vendor: string[]): DenPaths {
	const home = () => homeDir(env, platform);
	const join = (base: string, ...rest: string[]) => joinFor(platform, base, ...rest);
	const roaming = env("APPDATA") ?? join(home(), "AppData", "Roaming");
	const local = env("LOCALAPPDATA") ?? join(home(), "AppData", "Local");

	return {
		config: join(roaming, ...vendor, "config"),
		data: join(roaming, ...vendor, "data"),
		cache: join(local, ...vendor, "cache"),
		state: join(local, ...vendor, "state"),
		logs: join(local, ...vendor, "logs"),
		runtime: join(tempDir(env, platform), ...vendor),
	};
}

/** Every kind under one root, for `home`/`DEN_HOME` portable installs. */
function portablePaths(platform: DenPlatform, home: string): DenPaths {
	const paths = {} as DenPaths;
	for (const kind of DIR_KINDS) paths[kind] = joinFor(platform, home, kind);
	return paths;
}

/**
 * Resolves the full directory layout for an identity on a platform.
 *
 * Precedence runs narrowest-first: an explicit per-kind override beats a
 * portable `home`, which beats the platform layout.
 */
export function resolveLayout(
	identity: DenIdentity,
	platform: DenPlatform,
	env: EnvReader,
): DenPaths {
	const { name, org, home, dirs } = identity;

	let paths: DenPaths;
	if (home) {
		paths = portablePaths(platform, home);
	} else if (platform === "windows") {
		paths = windowsPaths(env, platform, org ? [org, name] : [name]);
	} else if (platform === "darwin") {
		paths = darwinPaths(env, platform, org ? `${org}.${name}` : name);
	} else {
		paths = xdgPaths(env, platform, name);
	}

	if (dirs) {
		for (const kind of DIR_KINDS) {
			const override = dirs[kind];
			if (override) paths[kind] = override;
		}
	}

	return paths;
}
