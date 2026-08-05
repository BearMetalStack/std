# @bearmetal/den

[![License: GPL v3](https://badger.bear-metal.dev/?label=License&value=GPL+v3&extra=&labelColor=label-light&valueColor=info-invert&extraColor=&variant=)](https://www.gnu.org/licenses/gpl-3.0)
[![JSR](https://badger.bear-metal.dev/?label=jsr&value=%40bearmetal%2Fden&valueColor=info)](https://jsr.io/@bearmetal/den)

Where your app's files go, on whatever OS it woke up on — and a file handle simple enough that you
never think about the path again.

```ts
import { den } from "@bearmetal/den";

const app = den({ name: "bearcave" });

const settings = app.config.file("settings.json");
const current = await settings.readJson({ theme: "dark" });
await settings.writeJson({ ...current, theme: "light" });
```

`den()` is synchronous and touches nothing on disk — it resolves paths, nothing more. Directories
are created lazily, the first time something is actually written. Zero dependencies beyond
`@std/path`.

## Six kinds of directory

Every kind is a real, separate directory on every platform — den never aliases two onto one path, so
`config/settings.json` and `data/settings.json` can never turn out to be the same file.

| kind      | what belongs there                                                    |
| --------- | --------------------------------------------------------------------- |
| `config`  | settings the user is expected to edit                                 |
| `data`    | application data the user would miss if it vanished                   |
| `cache`   | regenerable data; safe to delete at any time                          |
| `state`   | persists between runs but isn't user data — history, recents, cursors |
| `logs`    | log files                                                             |
| `runtime` | sockets, pid files, anything that dies with the session               |

<details>
<summary>The layout tables</summary>

**Linux and friends** follow the XDG Base Directory spec. `org` is ignored, because XDG has no
vendor directory. Relative `XDG_*` values are ignored too, as the spec requires.

| kind      | path                                                      |
| --------- | --------------------------------------------------------- |
| `config`  | `$XDG_CONFIG_HOME`, else `~/.config`, then `/<app>`       |
| `data`    | `$XDG_DATA_HOME`, else `~/.local/share`, then `/<app>`    |
| `cache`   | `$XDG_CACHE_HOME`, else `~/.cache`, then `/<app>`         |
| `state`   | `$XDG_STATE_HOME`, else `~/.local/state`, then `/<app>`   |
| `logs`    | `<state>/logs`                                            |
| `runtime` | `$XDG_RUNTIME_DIR`, else `$TMPDIR`, else `/tmp`, `/<app>` |

**macOS**, where `<bundle>` is `<org>.<app>` if you gave an org, else `<app>`:

| kind      | path                                           |
| --------- | ---------------------------------------------- |
| `config`  | `~/Library/Preferences/<bundle>`               |
| `data`    | `~/Library/Application Support/<bundle>`       |
| `cache`   | `~/Library/Caches/<bundle>`                    |
| `state`   | `~/Library/Application Support/<bundle>/state` |
| `logs`    | `~/Library/Logs/<bundle>`                      |
| `runtime` | `$TMPDIR/<bundle>`                             |

**Windows**, where `<vendor>` is `<org>\<app>` if you gave an org, else `<app>`. Config and data
roam; cache, state and logs stay local, because none of them are worth pushing across a roaming
profile.

| kind      | path                            |
| --------- | ------------------------------- |
| `config`  | `%APPDATA%\<vendor>\config`     |
| `data`    | `%APPDATA%\<vendor>\data`       |
| `cache`   | `%LOCALAPPDATA%\<vendor>\cache` |
| `state`   | `%LOCALAPPDATA%\<vendor>\state` |
| `logs`    | `%LOCALAPPDATA%\<vendor>\logs`  |
| `runtime` | `%TEMP%\<vendor>`               |

</details>

## Handles

A handle is a path plus two slots: whatever was last read off the disk, and whatever has been staged
for writing. Constructing one touches nothing.

```ts
const file = app.data.file("notes/today.md");

await file.read(); // string | undefined — missing files aren't errors
await file.readJson(); // parsed, or undefined
await file.readJson({ n: 0 }); // parsed, or the fallback
await file.readBytes(); // Uint8Array | undefined
await file.exists();
await file.stat(); // Deno.FileInfo | undefined
```

Writing comes in two tiers. `write`/`writeJson` persist immediately; `set`/`setJson`/`update` stage,
and `flush` persists.

```ts
await file.write("straight to disk");

file.set("staged"); // nothing on disk yet
file.dirty; // true
await file.read(); // "staged" — a handle reads its own writes
await file.flush(); // now it's on disk

await file.update<Config>((c) => ({ ...c, runs: (c?.runs ?? 0) + 1 }));
await file.flush();

file.discard(); // drop what's staged, leave the file alone
file.reload(); // drop the cached read too, next read hits the disk
```

Or let the scope flush for you:

```ts
{
	await using session = app.state.file("session.json");
	session.setJson({ open: true });
} // flushed here
```

Also `append(...)` (flushes anything pending first), `remove()`, `path`, and `url`.

Flushes are atomic by default — temp file, then rename — so a concurrent reader sees either the old
file or the new one, never a truncated one. An existing file's mode is carried across the rename
rather than being reset; new files start at `0600`. Pass `atomic: false` to write in place.

Parent directories are created on write, so `app.data.file("a/b/c.json").write(...)` just works.

Directories are handles too:

```ts
app.cache.dir("thumbs").file("a.png");
await app.cache.list(); // Deno.DirEntry[], [] when missing
await app.cache.walk(); // async iterator of relative paths, recursive
await app.cache.empty(); // clear it out, keep the directory
await app.cache.remove();
await app.ensure(); // mkdir -p all six
```

Segments may contain `/`, so `file("a/b.json")` and `file("a", "b.json")` are the same thing. What
they may never do is leave the directory — `..`, an absolute path, or an embedded NUL throws
`DenPathError`. Handles get built from names that came from a user, a config file, or a request, and
`cache.file(key)` must not be a way to write to `/etc`.

## Naming the app

The name comes from the first source that has one:

1. `den({ name: "bearcave" })`
2. `$DEN_APP_NAME`, or `$DEN_APP`
3. the nearest `den.json`, `deno.json`, `deno.jsonc` or `package.json`, walking up from the working
   directory

For the config-file route, a `den` field wins; otherwise the package's own `name` is used with any
scope stripped, so `@bearmetal/bearcave` is app `bearcave`. Comments and trailing commas are fine —
`deno.jsonc` parses.

```jsonc
// deno.json
{
	"name": "@bearmetal/bearcave",
	"den": { "name": "bearcave", "org": "cyborggrizzly" }
}
```

With no name from anywhere, `den()` throws `DenConfigError` rather than guessing. A wrong guess
writes user data somewhere nobody will ever find it.

`org`, `home` and per-kind directory overrides resolve the same way, field by field — an app name
from `deno.json` composes with a `DEN_HOME` from the environment and a `dirs.cache` from the call
site.

| variable                                                                                              | effect                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------ |
| `DEN_APP_NAME` / `DEN_APP`                                                                            | app name                 |
| `DEN_ORG`                                                                                             | organisation             |
| `DEN_HOME`                                                                                            | portable root; see below |
| `DEN_CONFIG_DIR`, `DEN_DATA_DIR`, `DEN_CACHE_DIR`, `DEN_STATE_DIR`, `DEN_LOGS_DIR`, `DEN_RUNTIME_DIR` | override that one kind   |

Pass `envPrefix` to rename all of them at once: `den({ envPrefix: "BEARCAVE" })` reads
`BEARCAVE_APP_NAME` and friends.

## Portable installs, and tests

`home` (or `$DEN_HOME`) replaces the platform layout entirely — every kind becomes `<home>/<kind>`.
Good for a USB-stick install, and good for tests:

```ts
const home = await Deno.makeTempDir();
const app = den({ name: "bearcave", home, discover: false });
app.cache.path; // <home>/cache
```

`platform` and `env` are overridable too, so a Windows layout can be asserted from Linux:

```ts
den({
	name: "bearcave",
	platform: "windows",
	env: (key) => ({ APPDATA: "C:\\Users\\Emma\\AppData\\Roaming" })[key],
	discover: false,
}).config.path; // C:\Users\Emma\AppData\Roaming\bearcave\config
```

Note that `platform` only changes _path resolution_; file operations still run against the real
host.

## Permissions

Reading the environment is permission-safe — without `--allow-env` den simply doesn't see the
variables and falls through to the next source, rather than throwing. Reading and writing files
needs the usual `--allow-read` / `--allow-write`.

## Errors

`DenError` is the base. `DenConfigError` means no usable app name; `DenPathError` means a segment
tried to escape; `DenEnvError` means the environment never said where home is.
