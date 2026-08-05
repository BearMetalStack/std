/**
 * @module
 * Public types for `@bearmetal/den`.
 */

/** The platforms den knows how to lay out. Anything else is treated as XDG. */
export type DenPlatform = "linux" | "darwin" | "windows";

/**
 * The kinds of directory an application gets. Every kind is a real, separate
 * directory on every platform — den never aliases two kinds onto one path.
 */
export type DenDirKind = "config" | "data" | "cache" | "state" | "logs" | "runtime";

/** Reads an environment variable, returning `undefined` when unset or unreadable. */
export type EnvReader = (key: string) => string | undefined;

/** The resolved absolute path for every {@linkcode DenDirKind}. */
export type DenPaths = Record<DenDirKind, string>;

/** Who the app is — the part of the layout that isn't the platform's business. */
export type DenIdentity = {
	/** Application name. The directory name on Linux, part of the bundle id elsewhere. */
	name: string;
	/** Optional vendor/organisation. Ignored on Linux, per the XDG spec. */
	org?: string;
	/** Root that replaces the OS layout entirely; every kind becomes `<home>/<kind>`. */
	home?: string;
	/** Per-kind absolute path overrides, applied last. */
	dirs?: Partial<DenPaths>;
};

/** Shape of a `den.json`, or of the `den` field in a `deno.json`/`package.json`. */
export type DenConfigFile = Partial<DenIdentity>;

/** Options for {@linkcode den}. Every field can instead come from env or config. */
export type DenOptions = Partial<DenIdentity> & {
	/**
	 * Prefix for the environment variables den reads. Defaults to `DEN`, giving
	 * `DEN_APP_NAME`, `DEN_ORG`, `DEN_HOME` and `DEN_<KIND>_DIR`.
	 */
	envPrefix?: string;
	/** Environment reader override. Defaults to a permission-safe `Deno.env.get`. */
	env?: EnvReader;
	/** Platform override. Defaults to `Deno.build.os`. */
	platform?: DenPlatform;
	/** Directory the config-file search starts from. Defaults to `Deno.cwd()`. */
	cwd?: string;
	/**
	 * Whether to look for a `den.json`/`deno.json`/`deno.jsonc`/`package.json`
	 * when the name wasn't given explicitly or by environment. Defaults to true.
	 */
	discover?: boolean;
	/**
	 * Write through a temp file and rename, so a reader never sees a half-written
	 * file. Defaults to true.
	 */
	atomic?: boolean;
};

/** A handle on one file. Cheap to construct; touches the disk only when asked. */
export type DenFile<T = unknown> = {
	/** Absolute path of the file. It need not exist. */
	readonly path: string;
	/** {@linkcode path} as a `file:` URL. */
	readonly url: URL;
	/** Whether there is staged content waiting for {@linkcode DenFile.flush}. */
	readonly dirty: boolean;

	/** Whether the file exists on disk right now. */
	exists(): Promise<boolean>;
	/** `Deno.stat`, or `undefined` when the file is missing. */
	stat(): Promise<Deno.FileInfo | undefined>;

	/** Staged content if any, else the file's text, else `undefined`. */
	read(): Promise<string | undefined>;
	/** Like {@linkcode DenFile.read}, as bytes. */
	readBytes(): Promise<Uint8Array | undefined>;
	/** Parsed JSON, or `undefined` when the file is missing or unparseable. */
	readJson<J = T>(): Promise<J | undefined>;
	/** Parsed JSON, falling back to `fallback` when missing or unparseable. */
	readJson<J = T>(fallback: J): Promise<J>;

	/** Stage content. Nothing hits the disk until {@linkcode DenFile.flush}. */
	set(content: string | Uint8Array): DenFile<T>;
	/** Stage a value as JSON. */
	setJson<J = T>(value: J): DenFile<T>;
	/** Read, transform, and stage the result. */
	update<J = T>(fn: (current: J | undefined) => J | Promise<J>): Promise<DenFile<T>>;
	/** Drop staged content, leaving the file on disk untouched. */
	discard(): DenFile<T>;

	/** Stage and flush in one step. */
	write(content: string | Uint8Array): Promise<void>;
	/** Stage a value as JSON and flush. */
	writeJson<J = T>(value: J): Promise<void>;
	/** Flush anything pending, then append to the file. */
	append(content: string | Uint8Array): Promise<void>;

	/** Write staged content to disk, creating parent directories. No-op when clean. */
	flush(): Promise<void>;
	/** Forget both staged content and the cached read. */
	reload(): DenFile<T>;
	/** Delete the file if it exists, and drop anything staged. */
	remove(): Promise<void>;

	/** Flushes, so `await using file = dir.file("x.json")` persists on scope exit. */
	[Symbol.asyncDispose](): Promise<void>;
};

/** A handle on one directory. */
export type DenDir = {
	/** Absolute path of the directory. It need not exist. */
	readonly path: string;
	/** {@linkcode path} as a `file:` URL, with a trailing slash. */
	readonly url: URL;

	/** A file handle under this directory. Segments may contain `/`, never `..`. */
	file<T = unknown>(...segments: string[]): DenFile<T>;
	/** A subdirectory handle. Segments may contain `/`, never `..`. */
	dir(...segments: string[]): DenDir;

	/** Whether the directory exists on disk right now. */
	exists(): Promise<boolean>;
	/** `mkdir -p` this directory. */
	ensure(): Promise<DenDir>;
	/** Direct children, or `[]` when the directory is missing. */
	list(): Promise<Deno.DirEntry[]>;
	/** Every descendant file, as paths relative to this directory. */
	walk(): AsyncIterableIterator<string>;
	/** Delete the contents but keep the directory. */
	empty(): Promise<void>;
	/** Delete the directory and everything under it. */
	remove(): Promise<void>;
};

/** An application's directories. */
export type Den = {
	/** Resolved application name. */
	readonly name: string;
	/** Resolved organisation, when one was given. */
	readonly org?: string;
	/** Platform the layout was resolved for. */
	readonly platform: DenPlatform;
	/** Every resolved path, by kind. */
	readonly paths: DenPaths;

	/** User configuration — settings the user is expected to edit. */
	readonly config: DenDir;
	/** Application data the user would miss if it vanished. */
	readonly data: DenDir;
	/** Regenerable data. Safe to delete at any time. */
	readonly cache: DenDir;
	/** State that persists between runs but isn't user data (history, recents). */
	readonly state: DenDir;
	/** Log files. */
	readonly logs: DenDir;
	/** Sockets, pid files, and anything else that dies with the session. */
	readonly runtime: DenDir;

	/** Look a directory up by kind. */
	dir(kind: DenDirKind): DenDir;
	/** `mkdir -p` every directory. */
	ensure(): Promise<Den>;
};

// Error classes are values, not types, so they live in ./errors.ts and reach
// consumers through mod.ts.
