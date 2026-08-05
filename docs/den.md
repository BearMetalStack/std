# @bearmetal/den

OS-correct application directories, and file handles simple enough that you never think about the
path again.

```ts
import { den } from "@bearmetal/den";
```

## Quick start

```ts
const app = den({ name: "bearcave" });

const settings = app.config.file("settings.json");
const current = await settings.readJson({ theme: "dark" });
await settings.writeJson({ ...current, theme: "light" });
```

`den()` is synchronous and touches nothing on disk — it resolves paths, nothing more. Directories
are created lazily, the first time something is actually written. The only dependency is
`@std/path`.

---

## Directory kinds

An app gets six directories. Every kind is a real, separate directory on every platform — den never
aliases two onto one path, so `config/settings.json` and `data/settings.json` can never turn out to
be the same file.

| kind      | what belongs there                                                    |
| --------- | --------------------------------------------------------------------- |
| `config`  | settings the user is expected to edit                                 |
| `data`    | application data the user would miss if it vanished                   |
| `cache`   | regenerable data; safe to delete at any time                          |
| `state`   | persists between runs but isn't user data — history, recents, cursors |
| `logs`    | log files                                                             |
| `runtime` | sockets, pid files, anything that dies with the session               |

Each is a [directory handle](#directory-handles) on the returned app, and `app.paths` has the raw
strings:

```ts
app.config.path; // /home/emma/.config/bearcave
app.paths.cache; // /home/emma/.cache/bearcave
app.dir("logs"); // same handle as app.logs
```

### Linux and friends

The [XDG Base Directory spec](https://specifications.freedesktop.org/basedir-spec/latest/). `org` is
ignored, because XDG has no notion of a vendor directory. Relative `XDG_*` values are ignored too,
as the spec requires — otherwise a relative `$XDG_CONFIG_HOME` scatters config wherever the process
happened to start.

| kind      | path                                                      |
| --------- | --------------------------------------------------------- |
| `config`  | `$XDG_CONFIG_HOME`, else `~/.config`, then `/<app>`       |
| `data`    | `$XDG_DATA_HOME`, else `~/.local/share`, then `/<app>`    |
| `cache`   | `$XDG_CACHE_HOME`, else `~/.cache`, then `/<app>`         |
| `state`   | `$XDG_STATE_HOME`, else `~/.local/state`, then `/<app>`   |
| `logs`    | `<state>/logs`                                            |
| `runtime` | `$XDG_RUNTIME_DIR`, else `$TMPDIR`, else `/tmp`, `/<app>` |

### macOS

`<bundle>` is `<org>.<app>` when an org was given, else `<app>`.

| kind      | path                                           |
| --------- | ---------------------------------------------- |
| `config`  | `~/Library/Preferences/<bundle>`               |
| `data`    | `~/Library/Application Support/<bundle>`       |
| `cache`   | `~/Library/Caches/<bundle>`                    |
| `state`   | `~/Library/Application Support/<bundle>/state` |
| `logs`    | `~/Library/Logs/<bundle>`                      |
| `runtime` | `$TMPDIR/<bundle>`                             |

### Windows

`<vendor>` is `<org>\<app>` when an org was given, else `<app>`. Config and data are roaming; cache,
state and logs are local, because none of them are worth pushing across a roaming profile.

| kind      | path                            |
| --------- | ------------------------------- |
| `config`  | `%APPDATA%\<vendor>\config`     |
| `data`    | `%APPDATA%\<vendor>\data`       |
| `cache`   | `%LOCALAPPDATA%\<vendor>\cache` |
| `state`   | `%LOCALAPPDATA%\<vendor>\state` |
| `logs`    | `%LOCALAPPDATA%\<vendor>\logs`  |
| `runtime` | `%TEMP%\<vendor>`               |

---

## Naming the app

The app name comes from the first source that has one:

1. `den({ name: "bearcave" })`
2. the `BEARMETAL_DEN_APP_NAME` or `BEARMETAL_DEN_APP` environment variable
3. the nearest `den.json`, `deno.json`, `deno.jsonc` or `package.json`, walking up from the working
   directory

For the config-file route a `den` field wins outright; failing that, the package's own `name` is
used with any scope stripped, so `@bearmetal/bearcave` is app `bearcave`. Comments and trailing
commas are fine — `deno.jsonc` parses.

```jsonc
// deno.json
{
	"name": "@bearmetal/bearcave",
	"den": { "name": "bearcave", "org": "cyborggrizzly" }
}
```

Which means that inside a Deno project, this usually just works:

```ts
const app = den(); // name comes from deno.json
```

With no name from anywhere, `den()` throws `DenConfigError` rather than guessing. A wrong guess
writes user data somewhere nobody will ever find it.

### Compiled binaries

::: warning In a `deno compile` binary, the config file must be embedded in the binary to be found.
Config discovery searches the binary's embedded file system — never the host's. `deno compile`
embeds the module graph, and a config file is not a module, so unless you pass it to `--include`
there is nothing to discover.

```sh
deno compile --include den.json main.ts
```

:::

This is deliberate, and it is worth understanding why. `Deno.cwd()` inside a compiled binary is
wherever the user happened to run the executable, not where the app was built. A discovery walk that
starts there means a binary launched inside somebody else's project picks up _their_ `deno.json`,
decides it is called something else, and writes its data under that name:

```sh
$ cd ~/projects/unrelated-thing && bearcave
# without the bound: resolves as "unrelated-thing", writes to ~/.config/unrelated-thing
```

Worse, the embedded file system is rooted at a virtual `deno-compile-<name>` directory, and
`file:///tmp/deno-compile-bearcave/..` is the real `/tmp` — so an unbounded walk climbs straight out
of the binary and back onto the host filesystem. den bounds the search at the virtual root, and
never consults the cwd when compiled.

The simpler answer for a binary is usually to name the app outright and skip discovery entirely:

```ts
const app = den({ name: "bearcave" });
```

None of this applies if you aren't using `deno compile` or Deno Desktop. `isCompiled()` is exported
if you want to branch on it, and `DenConfigError` explains all of the above when it fires from
inside a binary.

`org`, `home` and per-kind overrides resolve through the same three layers, field by field — an app
name from `deno.json` composes with a `BEARMETAL_DEN_HOME` from the environment and a `dirs.cache`
from the call site.

### Environment variables

| variable                                                                                                                                                          | effect                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `BEARMETAL_DEN_APP_NAME`, `BEARMETAL_DEN_APP`                                                                                                                     | app name               |
| `BEARMETAL_DEN_ORG`                                                                                                                                               | organisation           |
| `BEARMETAL_DEN_HOME`                                                                                                                                              | portable root          |
| `BEARMETAL_DEN_CONFIG_DIR`, `BEARMETAL_DEN_DATA_DIR`, `BEARMETAL_DEN_CACHE_DIR`, `BEARMETAL_DEN_STATE_DIR`, `BEARMETAL_DEN_LOGS_DIR`, `BEARMETAL_DEN_RUNTIME_DIR` | override that one kind |

`envPrefix` renames the whole set at once, so a shipped binary can own its own variables:

```ts
den({ envPrefix: "BEARCAVE" }); // reads BEARCAVE_APP_NAME, BEARCAVE_HOME, ...
```

Environment access is permission-safe. Without `--allow-env`, den simply doesn't see the variables
and falls through to the next source, rather than throwing.

---

## File handles

A handle is a path plus two slots: whatever was last read off the disk, and whatever has been staged
for writing. Constructing one touches nothing.

```ts
const file = app.data.file("notes/today.md");
```

Segments may contain `/`, so `file("a/b.json")` and `file("a", "b.json")` are the same thing. What
they may never do is leave the directory — `..`, an absolute path, or an embedded NUL throws
`DenPathError`. Handles get built from names that came from a user, a config file, or a request, and
`cache.file(key)` must not be a way to write to `/etc`.

### Reading

Missing files are not errors. `read` and `readBytes` yield `undefined`; `readJson` yields
`undefined`, or a fallback if you pass one.

```ts
await file.read(); // string | undefined
await file.readBytes(); // Uint8Array | undefined
await file.readJson(); // T | undefined
await file.readJson({ n: 0 }); // T -- parsed, or the fallback
await file.exists(); // boolean
await file.stat(); // Deno.FileInfo | undefined
```

`readJson` falls back on unparseable JSON too, so a truncated config file doesn't take the app down
on startup.

The first read is cached on the handle. `reload()` drops it.

### Writing

Two tiers. `write`/`writeJson` persist immediately; `set`/`setJson`/`update` stage, and `flush`
persists.

```ts
await file.write("straight to disk");
await file.writeJson({ theme: "light" });
```

```ts
file.set("staged"); // nothing on disk yet
file.dirty; // true
await file.read(); // "staged" -- a handle reads its own writes
await file.flush(); // now it's on disk
```

`update` is the read-modify-write shorthand:

```ts
const runs = app.state.file("runs.json");
await runs.update<{ n: number }>((current) => ({ n: (current?.n ?? 0) + 1 }));
await runs.flush();
```

`discard()` drops what's staged and leaves the file alone; `reload()` drops the cached read as well,
so the next read hits the disk.

Or let the scope do the flushing:

```ts
{
	await using session = app.state.file("session.json");
	session.setJson({ open: true });
} // flushed here
```

Also `append(content)` — which flushes anything pending first, so an appended log line can never
jump ahead of a staged write — and `remove()`, `path`, and `url`.

### Durability

Flushes are atomic by default: den writes a sibling temp file and renames it over the target, so a
concurrent reader sees either the old file or the new one, never a truncated one.

A rename replaces the target's permissions along with its contents, so den carries the existing
file's mode across rather than silently re-privatising a file the user chmod'd. New files start at
`0600` — this is the user's own data. Pass `atomic: false` to write in place instead.

Parent directories are created on write, so `app.data.file("a/b/c.json").write(...)` just works.

---

## Directory handles

Inert until a method is called — `den().cache.dir("thumbs")` touches nothing.

```ts
app.cache.dir("thumbs").file("a.png"); // nest freely
await app.cache.list(); // Deno.DirEntry[], [] when missing
await app.cache.walk(); // async iterator of relative paths, recursive
await app.cache.ensure(); // mkdir -p
await app.cache.empty(); // clear it out, keep the directory
await app.cache.remove(); // and the directory too
await app.ensure(); // bootstrap: verify, create and claim all six
```

Plus `owner()`, `inspect()` and `claim()` — see [Ownership](#ownership).

`walk()` yields descendant files as paths relative to the directory:

```ts
for await (const path of app.cache.walk()) {
	console.log(path); // "a.txt", "nested/b.txt", ...
}
```

---

## Ownership

Nothing stops two apps picking the same name, or a stray `BEARMETAL_DEN_CONFIG_DIR` pointing
somewhere that is already occupied, or a `dirs` override quietly landing two kinds on one path. None
of those announce themselves — you find out when an app reads someone else's settings, or clears
them. So den checks at bootstrap.

`app.ensure()` is that bootstrap. It inspects all six paths, warns about anything surprising, then
creates and claims the ones that are free by writing a `.bearmetal_den` marker naming the app, the
org, and the kind.

```ts
await app.ensure(); // safe to call on every start
```

| status      | meaning                                  | what `ensure()` does      |
| ----------- | ---------------------------------------- | ------------------------- |
| `absent`    | nothing there yet                        | create and claim          |
| `owned`     | claimed by this app, for this kind       | nothing                   |
| `unmarked`  | exists but empty                         | claim                     |
| `unclaimed` | exists with content den didn't create    | warn once, then claim     |
| `conflict`  | claimed by a different app, org, or kind | warn, and **leave alone** |

An app adopting den for the first time hits `unclaimed` once, gets told, and is quiet from then on.

A `conflict` directory is not created, not claimed, and not written to. Whatever is there belongs to
someone else, and den will not launder a collision into an ownership change nobody notices —
`claim()` refuses to overwrite another app's marker, and `empty()`/`remove()` refuse to run at all
unless you pass `{ force: true }`.

### Handling it yourself

`inspect()` is the same check with no side effects, for when you'd rather fail loudly than be
warned:

```ts
for (const report of await app.inspect()) {
	if (report.status === "conflict") throw new Error(report.message);
}
```

A single directory answers too:

```ts
await app.config.owner(); // DenOwner | undefined
await app.config.inspect(); // DenOwnership
await app.config.claim(); // create + write the marker
```

### What the marker is, and isn't

It is den's bookkeeping, not your data. `list()` and `walk()` skip it, and `empty()` keeps it —
emptying a directory is not disowning it. A corrupt marker is treated as no marker, never as a
conflict.

Only the six top-level directories carry ownership. Nested `dir()` handles are the app's own
business, so they have no marker and no ownership checks.

### Collisions, before any I/O

Two kinds resolving to one path is caught synchronously, at construction:

```ts
den({ name: "bearcave", dirs: { cache: "/shared", state: "/shared" } });
// [den] cache and state both resolve to /shared
```

### Warnings

Warnings go to `console.warn` with a `[den]` prefix by default. `onWarning` redirects them — collect
them, route them into your own logging, or silence them:

```ts
const warnings: DenWarning[] = [];
den({ name: "bearcave", onWarning: (w) => warnings.push(w) });
```

---

## Portable installs, and tests

`home` — or `$BEARMETAL_DEN_HOME` — replaces the platform layout entirely: every kind becomes
`<home>/<kind>`. Good for a USB-stick install, and good for tests.

```ts
const home = await Deno.makeTempDir();
const app = den({ name: "bearcave", home, discover: false });
app.cache.path; // <home>/cache
```

`discover: false` skips the config-file walk, which keeps a test from picking up the name of
whatever project it happens to be running inside.

`platform` and `env` are overridable too, so a Windows layout can be asserted from Linux:

```ts
den({
	name: "bearcave",
	platform: "windows",
	env: (key) => ({ APPDATA: "C:\\Users\\Emma\\AppData\\Roaming" })[key],
	discover: false,
}).config.path; // C:\Users\Emma\AppData\Roaming\bearcave\config
```

`platform` only changes path resolution. File operations still run against the real host.

---

## Options

```ts
den({
	name: "bearcave", // app name
	org: "cyborggrizzly", // vendor; ignored on Linux
	home: "/opt/bearcave", // portable root, replaces the platform layout
	dirs: { cache: "/mnt/fast" }, // per-kind overrides, applied last
	envPrefix: "BEARMETAL_DEN", // prefix for every variable den reads
	env: Deno.env.get, // environment reader
	platform: "linux", // platform to resolve paths for
	cwd: Deno.cwd(), // where the config-file walk starts
	discover: true, // whether to walk for a config file at all
	atomic: true, // temp-file-and-rename on flush
	onWarning: (w) => {}, // where collision and ownership warnings go
});
```

Every field is optional. Precedence for the identity fields (`name`, `org`, `home`, `dirs`) runs
options → environment → config file, independently per field.

---

## Errors

`DenError` is the base class for everything den throws.

| error               | means                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `DenConfigError`    | no usable app name from any source, or a name with a separator in it |
| `DenPathError`      | a path segment tried to escape its directory                         |
| `DenEnvError`       | the environment never said where the home directory is               |
| `DenOwnershipError` | a destructive call was aimed at a directory another app has claimed  |
