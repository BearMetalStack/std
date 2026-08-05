import { assertEquals, assertThrows } from "@std/assert";
import { resolveLayout } from "./layout.ts";
import { den } from "./mod.ts";
import { DenConfigError, DenEnvError, DenPathError } from "./errors.ts";
import type { EnvReader } from "./types.ts";

/** A fake environment, so layouts can be resolved for any platform from any host. */
function fakeEnv(vars: Record<string, string> = {}): EnvReader {
	return (key) => vars[key];
}

const unix = fakeEnv({ HOME: "/home/emma" });
const win = fakeEnv({
	USERPROFILE: "C:\\Users\\Emma",
	APPDATA: "C:\\Users\\Emma\\AppData\\Roaming",
	LOCALAPPDATA: "C:\\Users\\Emma\\AppData\\Local",
	TEMP: "C:\\Users\\Emma\\AppData\\Local\\Temp",
});

Deno.test("xdg layout uses the spec defaults", () => {
	const paths = resolveLayout({ name: "bearcave" }, "linux", unix);
	assertEquals(paths, {
		config: "/home/emma/.config/bearcave",
		data: "/home/emma/.local/share/bearcave",
		cache: "/home/emma/.cache/bearcave",
		state: "/home/emma/.local/state/bearcave",
		logs: "/home/emma/.local/state/bearcave/logs",
		runtime: "/tmp/bearcave",
	});
});

Deno.test("xdg layout honours XDG_* overrides", () => {
	const env = fakeEnv({
		HOME: "/home/emma",
		XDG_CONFIG_HOME: "/etc/xdg-user",
		XDG_CACHE_HOME: "/var/cache/emma",
		XDG_RUNTIME_DIR: "/run/user/1000",
	});
	const paths = resolveLayout({ name: "bearcave" }, "linux", env);
	assertEquals(paths.config, "/etc/xdg-user/bearcave");
	assertEquals(paths.cache, "/var/cache/emma/bearcave");
	assertEquals(paths.runtime, "/run/user/1000/bearcave");
	assertEquals(paths.data, "/home/emma/.local/share/bearcave");
});

Deno.test("relative XDG values are ignored, as the spec requires", () => {
	const env = fakeEnv({ HOME: "/home/emma", XDG_CONFIG_HOME: "relative/config" });
	assertEquals(
		resolveLayout({ name: "bearcave" }, "linux", env).config,
		"/home/emma/.config/bearcave",
	);
});

Deno.test("xdg layout ignores org", () => {
	const withOrg = resolveLayout({ name: "bearcave", org: "cyborggrizzly" }, "linux", unix);
	assertEquals(withOrg.config, "/home/emma/.config/bearcave");
});

Deno.test("darwin layout separates preferences, support, caches and logs", () => {
	const paths = resolveLayout({ name: "bearcave" }, "darwin", unix);
	assertEquals(paths, {
		config: "/home/emma/Library/Preferences/bearcave",
		data: "/home/emma/Library/Application Support/bearcave",
		cache: "/home/emma/Library/Caches/bearcave",
		state: "/home/emma/Library/Application Support/bearcave/state",
		logs: "/home/emma/Library/Logs/bearcave",
		runtime: "/tmp/bearcave",
	});
});

Deno.test("darwin layout folds org into a bundle id", () => {
	const paths = resolveLayout({ name: "bearcave", org: "dev.bearmetal" }, "darwin", unix);
	assertEquals(paths.data, "/home/emma/Library/Application Support/dev.bearmetal.bearcave");
});

Deno.test("windows layout splits roaming from local", () => {
	const paths = resolveLayout({ name: "bearcave" }, "windows", win);
	assertEquals(paths, {
		config: "C:\\Users\\Emma\\AppData\\Roaming\\bearcave\\config",
		data: "C:\\Users\\Emma\\AppData\\Roaming\\bearcave\\data",
		cache: "C:\\Users\\Emma\\AppData\\Local\\bearcave\\cache",
		state: "C:\\Users\\Emma\\AppData\\Local\\bearcave\\state",
		logs: "C:\\Users\\Emma\\AppData\\Local\\bearcave\\logs",
		runtime: "C:\\Users\\Emma\\AppData\\Local\\Temp\\bearcave",
	});
});

Deno.test("windows layout nests under a vendor directory", () => {
	const paths = resolveLayout({ name: "bearcave", org: "CyborgGrizzly" }, "windows", win);
	assertEquals(paths.config, "C:\\Users\\Emma\\AppData\\Roaming\\CyborgGrizzly\\bearcave\\config");
});

Deno.test("windows falls back to HOMEDRIVE + HOMEPATH", () => {
	const env = fakeEnv({ HOMEDRIVE: "D:", HOMEPATH: "\\Users\\Emma" });
	const paths = resolveLayout({ name: "bearcave" }, "windows", env);
	assertEquals(paths.config, "D:\\Users\\Emma\\AppData\\Roaming\\bearcave\\config");
});

Deno.test("a home override replaces the whole layout", () => {
	const paths = resolveLayout({ name: "bearcave", home: "/opt/bearcave" }, "linux", unix);
	assertEquals(paths, {
		config: "/opt/bearcave/config",
		data: "/opt/bearcave/data",
		cache: "/opt/bearcave/cache",
		state: "/opt/bearcave/state",
		logs: "/opt/bearcave/logs",
		runtime: "/opt/bearcave/runtime",
	});
});

Deno.test("per-kind overrides win over everything", () => {
	const paths = resolveLayout(
		{ name: "bearcave", home: "/opt/bearcave", dirs: { cache: "/mnt/fast/cache" } },
		"linux",
		unix,
	);
	assertEquals(paths.cache, "/mnt/fast/cache");
	assertEquals(paths.data, "/opt/bearcave/data");
});

Deno.test("a missing home directory is an error, not a guess", () => {
	assertThrows(() => resolveLayout({ name: "bearcave" }, "linux", fakeEnv()), DenEnvError);
});

Deno.test("den() resolves identity from options, env, then config", () => {
	const app = den({
		name: "bearcave",
		platform: "linux",
		env: fakeEnv({ HOME: "/home/emma" }),
		discover: false,
	});
	assertEquals(app.name, "bearcave");
	assertEquals(app.platform, "linux");
	assertEquals(app.config.path, "/home/emma/.config/bearcave");
	assertEquals(app.dir("logs").path, app.paths.logs);
});

Deno.test("env supplies name, org and home", () => {
	const app = den({
		platform: "linux",
		discover: false,
		env: fakeEnv({
			HOME: "/home/emma",
			DEN_APP_NAME: "fromenv",
			DEN_ORG: "cyborggrizzly",
			DEN_CACHE_DIR: "/scratch",
		}),
	});
	assertEquals(app.name, "fromenv");
	assertEquals(app.org, "cyborggrizzly");
	assertEquals(app.cache.path, "/scratch");
});

Deno.test("the env prefix is configurable", () => {
	const app = den({
		platform: "linux",
		discover: false,
		envPrefix: "BEARCAVE",
		env: fakeEnv({ HOME: "/home/emma", BEARCAVE_APP_NAME: "bearcave" }),
	});
	assertEquals(app.name, "bearcave");
});

Deno.test("options beat env", () => {
	const app = den({
		name: "explicit",
		platform: "linux",
		discover: false,
		env: fakeEnv({ HOME: "/home/emma", DEN_APP_NAME: "fromenv" }),
	});
	assertEquals(app.name, "explicit");
});

Deno.test("no name anywhere throws rather than guessing", () => {
	assertThrows(
		() => den({ platform: "linux", discover: false, env: fakeEnv({ HOME: "/home/emma" }) }),
		DenConfigError,
	);
});

Deno.test("a name with a path separator is rejected", () => {
	assertThrows(
		() => den({ name: "bear/cave", platform: "linux", discover: false, env: unix }),
		DenConfigError,
	);
});

Deno.test("handles refuse to escape their directory", () => {
	const app = den({ name: "bearcave", platform: "linux", discover: false, env: unix });
	assertThrows(() => app.config.file("../../etc/passwd"), DenPathError);
	assertThrows(() => app.config.file("nested", "..", "..", "x"), DenPathError);
	assertThrows(() => app.config.file("/etc/passwd"), DenPathError);
	assertThrows(() => app.cache.dir("..", "other"), DenPathError);
	assertThrows(() => app.cache.file("bad\0name"), DenPathError);
});

Deno.test("segments may contain slashes and are normalised", () => {
	const app = den({ name: "bearcave", platform: "linux", discover: false, env: unix });
	assertEquals(
		app.data.file("a/b/c.json").path,
		app.data.file("a", "b", "c.json").path,
	);
	assertEquals(app.data.file("./a//b.json").path, "/home/emma/.local/share/bearcave/a/b.json");
});
