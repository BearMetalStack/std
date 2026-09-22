/** A value, or a function producing it once the dev server starts. */
export type Lazy<T> = T | (() => T | Promise<T>);

/** Options for `devServerModule`. */
export interface DevServerOptions {
	/**
	 * Directory whose files are served and watched. Defaults to the current
	 * working directory.
	 *
	 * A function is called when the module starts, after every module mounted
	 * before it has started, for a host that only knows the directory then.
	 */
	root?: Lazy<string>;
	/**
	 * The app's entry module or modules, relative to `root` (e.g. `"main.tsx"`).
	 *
	 * Setting one makes the server an SPA host: every navigation that isn't a
	 * file gets the shell, with the entries loaded as modules if the shell does
	 * not already load them. A function is re-evaluated whenever the page is
	 * about to reload, so a host can add entries as they appear.
	 */
	entry?: Lazy<string | string[]>;
	/**
	 * The HTML shell served for navigations, relative to `root`. Defaults to
	 * `index.html` when it exists, and a bare document otherwise.
	 */
	shell?: string;
	/**
	 * Whether to add the entries to server-rendered pages and the shell.
	 * Defaults to `true`; turn it off when the host references them itself —
	 * through `devServerSourceUrl`, for instance.
	 */
	injectEntry?: boolean;
	/**
	 * Whether to serve `root` and the SPA shell under the mount point. Defaults
	 * to `true`. With `false` the module registers no catch-all, and `root` is
	 * reachable only through `/@bearmetal/dev-server/src/*`.
	 */
	mount?: boolean;
	/** Applied to every compiled module and vendor file before it is served. */
	transform?: (code: string) => string;
}
