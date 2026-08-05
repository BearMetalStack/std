/**
 * @module
 * Detecting, and staying inside, the embedded file system of a compiled binary.
 *
 * `deno compile` roots the embedded file system at a virtual
 * `deno-compile-<name>` directory while `Deno.cwd()` still points at the real
 * one. That split is the whole problem: a config-file walk that starts at the
 * cwd is walking the *user's* filesystem, so a compiled `bearcave` binary run
 * inside somebody else's project picks up their `deno.json` and decides it is
 * called something else entirely.
 *
 * Two layouts show up in practice, and the walk has to survive both:
 *
 * ```
 * # no --include: the real path is preserved under the virtual root
 * file:///tmp/deno-compile-bearcave/home/emma/bearcave/main.ts
 *
 * # with --include: the root is the common ancestor of the included files
 * file:///tmp/deno-compile-bearcave/main.ts
 * ```
 *
 * Walking up from the entry module handles either one — but it must *stop* at
 * the virtual root, because `file:///tmp/deno-compile-bearcave/..` is the real
 * `/tmp`, and stepping through it puts us right back on the host filesystem
 * with the bug we were avoiding.
 */

const VIRTUAL_ROOT = /^(.*?\/deno-compile-[^/]*)\//;

/**
 * The entry module, but only when running inside a compiled binary. The
 * `deno-compile-` prefix is the only signal Deno exposes for "am I compiled",
 * and gating on it keeps this from firing during ordinary source runs. If the
 * prefix ever changes we simply stop detecting compiled mode and fall back to
 * the cwd walk, which is the pre-existing behaviour.
 */
export function compiledEntryModule(): URL | null {
	try {
		const url = new URL(Deno.mainModule);
		return url.protocol === "file:" && VIRTUAL_ROOT.test(url.pathname) ? url : null;
	} catch {
		return null;
	}
}

/** Whether this process is running from a `deno compile` binary. */
export function isCompiled(): boolean {
	return compiledEntryModule() !== null;
}

/**
 * The virtual root and the entry module's directory, or `null` when not
 * compiled. Everything embedded in the binary lives at or below `root`.
 */
export function compiledBounds(): { root: URL; start: URL } | null {
	const entry = compiledEntryModule();
	if (!entry) return null;

	const match = VIRTUAL_ROOT.exec(entry.pathname);
	if (!match) return null;

	const root = new URL(entry.href);
	root.pathname = match[1] + "/";
	return { root, start: new URL(".", entry) };
}

/**
 * Every directory from the entry module's own up to and including the virtual
 * root, nearest first. Empty when not running compiled.
 */
export function compiledAncestors(): URL[] {
	const bounds = compiledBounds();
	if (!bounds) return [];

	const { root, start } = bounds;
	const dirs: URL[] = [];
	let dir = start;

	while (dir.pathname.startsWith(root.pathname) || dir.pathname === root.pathname) {
		dirs.push(dir);
		if (dir.pathname === root.pathname) break;
		const parent = new URL("..", dir);
		if (parent.href === dir.href) break;
		dir = parent;
	}

	return dirs;
}
