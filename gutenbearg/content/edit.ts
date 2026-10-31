/**
 * Changes to the content tree that keep its numbering intact: adding a page or section between
 * two others, respacing a directory, cutting a version, copying a page forward. Paths in arguments
 * are written in slugs (`packages/core/0.9/reference/signal`), so nobody types a number to find a
 * file. A path that starts with a package's id instead (`core/reference/signal`) means that
 * package's current docs version, worked out from its `deno.json`.
 */

import { basename, dirname, join } from "@std/path";
import { splitFrontmatter } from "@bearmetal/clawmark";
import { VERSION_DIR } from "./load.ts";
import {
	compareVersions,
	docsVersion,
	findWorkspace,
	linkPackage,
	type VersionScheme,
	type Workspace,
} from "./workspace.ts";
import {
	between,
	formatName,
	nextNumber,
	type ParsedName,
	parseName,
	respace,
	STEP,
} from "./names.ts";

/** Thrown when an operation can't proceed; the message says what to do instead. */
export class ContentEditError extends Error {
	override readonly name = "ContentEditError";
}

interface Entry {
	name: string;
	parsed: ParsedName;
	/** The directory it was found in. */
	dir: string;
}

/**
 * The entries of `dirs`, oldest first, merged by slug with the newest name winning: what a reader
 * of the last one sees once inheritance is applied. Missing directories are skipped.
 */
async function entries(dirs: string | string[], kind: "page" | "section"): Promise<Entry[]> {
	const bySlug = new Map<string, Entry>();
	for (const dir of [dirs].flat()) {
		try {
			for await (const e of Deno.readDir(dir)) {
				if (e.name.startsWith(".") || e.name === "index.md") continue;
				if (kind === "page" ? e.isFile && e.name.endsWith(".md") : e.isDirectory) {
					if (kind === "section" && VERSION_DIR.test(e.name)) continue;
					const parsed = parseName(e.name);
					bySlug.set(parsed.slug, { name: e.name, parsed, dir });
				}
			}
		} catch (e) {
			if (!(e instanceof Deno.errors.NotFound)) throw e;
		}
	}
	return [...bySlug.values()].sort((a, b) =>
		a.parsed.order - b.parsed.order || (a.name < b.name ? -1 : 1)
	);
}

/**
 * Finds the real directory a slug path names under `root`: each segment matches a directory whose
 * name has that slug, whatever its number or icon. Segments with no match are an error.
 */
export async function resolveDir(root: string, slugPath: string): Promise<string> {
	let dir = root;
	for (const seg of slugPath.split("/").filter(Boolean)) {
		let found: string | undefined;
		for await (const e of Deno.readDir(dir)) {
			if (e.isDirectory && (e.name === seg || parseName(e.name).slug === seg)) found = e.name;
		}
		if (!found) throw new ContentEditError(`no directory "${seg}" in ${dir}`);
		dir = join(dir, found);
	}
	return dir;
}

/** Where to put a new entry: after one slug, before one, or (neither) at the end. */
export interface Position {
	after?: string;
	before?: string;
}

/**
 * The number a new entry in `dir` gets. Halves the gap between its neighbours; with no gap left,
 * throws unless `reindex` is set, in which case the directory is respaced first.
 */
export async function numberFor(
	dirs: string | string[],
	kind: "page" | "section",
	position: Position = {},
	reindexIfFull = false,
): Promise<number> {
	const layers = [dirs].flat();
	const dir = layers.at(-1)!;
	const list = (await entries(layers, kind)).filter((e) => e.parsed.numbered);
	const index = (slug: string) => {
		const i = list.findIndex((e) => e.parsed.slug === slug);
		if (i < 0) throw new ContentEditError(`nothing named "${slug}" in ${dir}`);
		return i;
	};
	let low: number | undefined;
	let high: number | undefined;
	if (position.after) {
		const i = index(position.after);
		low = list[i].parsed.order;
		high = list[i + 1]?.parsed.order;
	} else if (position.before) {
		const i = index(position.before);
		low = list[i - 1]?.parsed.order;
		high = list[i].parsed.order;
	} else {
		return nextNumber(list.at(-1)?.parsed.order);
	}
	const n = between(low, high);
	if (n !== null) return n;
	if (layers.length > 1) {
		throw new ContentEditError(
			`no room between ${low ?? "the start"} and ${high} in ${dir}, and older versions share ` +
				"its numbering; place it elsewhere, or reindex every version of it by hand",
		);
	}
	if (!reindexIfFull) {
		throw new ContentEditError(
			`no room between ${
				low ?? "the start"
			} and ${high} in ${dir}; reindex it first (or pass --reindex)`,
		);
	}
	// Before the first entry, respacing from zero would leave no gap again; start one step in.
	await reindex(dir, kind, { start: low === undefined ? STEP : 0 });
	return numberFor(dir, kind, position, false);
}

/** One rename {@linkcode reindex} made or would make. */
export interface Move {
	from: string;
	to: string;
}

/**
 * Respaces the numbered entries of `dir` to `start`, `start`+`step`… (0, 16, 32 by default) in their
 * current order. Renames go
 * through temporary names so no step collides with an entry not yet moved. Unnumbered entries are
 * left alone. With `dryRun`, only reports.
 */
export async function reindex(
	dir: string,
	kind: "page" | "section",
	options: { step?: number; start?: number; dryRun?: boolean } = {},
): Promise<Move[]> {
	const list = (await entries(dir, kind)).filter((e) => e.parsed.numbered);
	const numbers = respace(list.length, options.step ?? STEP).map((n) => n + (options.start ?? 0));
	const moves: Move[] = list.map((e, i) => ({
		from: e.name,
		to: formatName(numbers[i], e.parsed.slug, {
			icon: e.parsed.icon,
			ext: kind === "page" ? ".md" : "",
		}),
	})).filter((m) => m.from !== m.to);
	if (options.dryRun || !moves.length) return moves;
	const temp = (i: number) => join(dir, `.gb-reindex-${i}`);
	for (const [i, m] of moves.entries()) await Deno.rename(join(dir, m.from), temp(i));
	for (const [i, m] of moves.entries()) await Deno.rename(temp(i), join(dir, m.to));
	return moves;
}

/** A directory to write into, and the same directory in the versions it inherits from. */
export interface Target {
	/** Where new files go. May not exist yet; writing creates it. */
	dir: string;
	/** `dir` in every version up to it, oldest first, ending with `dir`. */
	layers: string[];
}

/** Options for the generators that work out a package's current version. */
export interface VersionOptions {
	/** The workspace to link packages to; found from `root` when left out. */
	workspace?: Workspace | null;
}

async function frontmatterOf(file: string): Promise<Record<string, unknown>> {
	try {
		return splitFrontmatter(await Deno.readTextFile(file)).data as Record<string, unknown>;
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) return {};
		throw e;
	}
}

/**
 * The docs version `pkg` is currently at: its workspace package's `deno.json` version, mapped by
 * the site's `versioning` (major.minor by default).
 */
export async function currentVersion(
	root: string,
	pkg: string,
	options: VersionOptions = {},
): Promise<string> {
	const site = (await frontmatterOf(join(root, "index.md"))).site as
		| Record<string, unknown>
		| undefined;
	const meta = await frontmatterOf(join(root, "packages", pkg, "index.md"));
	const workspace = options.workspace !== undefined
		? options.workspace
		: site?.workspace === false
		? null
		: await findWorkspace(root);
	const source = linkPackage(workspace, pkg, meta.package ? String(meta.package) : undefined);
	if (!source) {
		throw new ContentEditError(
			`"${pkg}" isn't linked to a workspace package; set \`package:\` in its index.md, or write ` +
				`the version in the path (packages/${pkg}/<version>/…)`,
		);
	}
	if (!source.version) throw new ContentEditError(`${source.name} has no version in its deno.json`);
	return docsVersion(source.version, (site?.versioning as VersionScheme | undefined) ?? "minor");
}

/**
 * The version directories of `pkg` a reader of its current version sees, oldest first, ending
 * with the current one (which may not exist yet). An unversioned package is its own directory.
 */
async function versionLayers(
	root: string,
	pkg: string,
	options: VersionOptions,
): Promise<string[]> {
	const base = join(root, "packages", pkg);
	const names: string[] = [];
	let sections = false;
	try {
		for await (const e of Deno.readDir(base)) {
			if (!e.isDirectory || e.name === "changelog") continue;
			if (VERSION_DIR.test(e.name)) names.push(e.name);
			else sections = true;
		}
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) {
			throw new ContentEditError(`no package "${pkg}" under ${join(root, "packages")}`);
		}
		throw e;
	}
	if (!names.length && sections) return [base];
	const current = await currentVersion(root, pkg, options);
	const older = names.filter((n) => compareVersions(n, current) < 0)
		.sort(compareVersions);
	const same = names.find((n) => compareVersions(n, current) === 0) ?? current;
	return [...older, same].map((n) => join(base, n));
}

/**
 * Resolves a slug path to the directory a generator writes into. `guides/…` and `packages/…`
 * name real directories; `<pkg>/…` names the package's current version, where each segment is
 * matched across the versions it inherits from and takes the newest name found, so a section
 * copied forward keeps its number and icon.
 */
export async function resolveTarget(
	root: string,
	slugPath: string,
	options: VersionOptions = {},
): Promise<Target> {
	const [first, ...rest] = slugPath.split("/").filter(Boolean);
	if (!first || first === "guides" || first === "packages") {
		const dir = await resolveDir(root, slugPath);
		return { dir, layers: [dir] };
	}
	let layers = await versionLayers(root, first, options);
	for (const seg of rest) {
		const found = (await entries(layers, "section")).find((e) =>
			e.name === seg || e.parsed.slug === seg
		);
		if (!found) {
			throw new ContentEditError(`no section "${seg}" in ${first}'s current version`);
		}
		layers = layers.map((l) => join(l, found.name));
	}
	return { dir: layers.at(-1)!, layers };
}

/**
 * Writes a stub page at `slugPath` (`guides/start-here/deploying`, or `core/learn/batching` for
 * a package's current version): the last segment is the new page's slug, the rest names an
 * existing section. Returns the file written.
 */
export async function newPage(
	root: string,
	slugPath: string,
	options: Position & VersionOptions & { title?: string; reindex?: boolean } = {},
): Promise<string> {
	const parts = slugPath.split("/").filter(Boolean);
	const slug = parts.pop();
	if (!slug) throw new ContentEditError("give a path ending in the new page's slug");
	const { dir, layers } = await resolveTarget(root, parts.join("/"), options);
	const existing = (await entries(layers, "page")).find((e) => e.parsed.slug === slug);
	if (existing) {
		throw new ContentEditError(
			existing.dir === dir
				? `"${slug}" already exists in ${dir}`
				: `"${slug}" is inherited from ${existing.dir}; use \`edit\` to bring it forward`,
		);
	}
	const n = await numberFor(layers, "page", options, options.reindex);
	await Deno.mkdir(dir, { recursive: true });
	const file = join(dir, formatName(n, slug, { ext: ".md" }));
	const title = options.title ?? slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
	await Deno.writeTextFile(file, `---\ndraft: true\n---\n\n# ${title}\n`, { createNew: true });
	return file;
}

/** Creates a section directory at `slugPath`, optionally with an icon. Returns the directory. */
export async function newSection(
	root: string,
	slugPath: string,
	options: Position & VersionOptions & { icon?: string; reindex?: boolean } = {},
): Promise<string> {
	const parts = slugPath.split("/").filter(Boolean);
	const slug = parts.pop();
	if (!slug) throw new ContentEditError("give a path ending in the new section's slug");
	const { dir: parent, layers } = await resolveTarget(root, parts.join("/"), options);
	if ((await entries(layers, "section")).some((e) => e.parsed.slug === slug)) {
		throw new ContentEditError(`"${slug}" already exists in ${parent}`);
	}
	const n = await numberFor(layers, "section", options, options.reindex);
	const dir = join(parent, formatName(n, slug, { icon: options.icon }));
	await Deno.mkdir(dir, { recursive: true });
	return dir;
}

/** What {@linkcode copyForward} did. */
export interface CopyResult {
	file: string;
	/** False when the page already lived in the current version. */
	copied: boolean;
}

/**
 * Brings a package page into its current version so it can be changed there without touching
 * the versions before it: `core/reference/signal` copies the newest older copy of `signal` into
 * the current version, under the same section and file names. Already there, it only says where.
 */
export async function copyForward(
	root: string,
	slugPath: string,
	options: VersionOptions = {},
): Promise<CopyResult> {
	const parts = slugPath.split("/").filter(Boolean);
	const slug = parts.pop();
	if (!slug || parts.length < 2 || parts[0] === "guides" || parts[0] === "packages") {
		throw new ContentEditError(
			"give a package page as <package>/<section>/<page>; guides aren't versioned, so edit them in place",
		);
	}
	const { dir, layers } = await resolveTarget(root, parts.join("/"), options);
	const found = (await entries(layers, "page")).find((e) => e.parsed.slug === slug);
	if (!found) {
		throw new ContentEditError(
			`no page "${slug}" in ${parts.join("/")}; use \`new page\` to add one`,
		);
	}
	const from = join(found.dir, found.name);
	if ((await frontmatterOf(from)).removed === true) {
		throw new ContentEditError(`"${slug}" was removed in ${basename(dirname(found.dir))}`);
	}
	if (found.dir === dir) return { file: from, copied: false };
	await Deno.mkdir(dir, { recursive: true });
	const file = join(dir, found.name);
	await Deno.copyFile(from, file);
	return { file, copied: true };
}

/**
 * Starts a new version of a package. Versions inherit, so it is an empty directory: pages are
 * added to it only as they change.
 */
export async function cutVersion(root: string, pkg: string, version: string): Promise<string> {
	const base = join(root, "packages", pkg);
	try {
		await Deno.stat(base);
	} catch {
		throw new ContentEditError(`no package "${pkg}" under ${join(root, "packages")}`);
	}
	const dir = join(base, version);
	try {
		await Deno.mkdir(dir);
	} catch (e) {
		if (e instanceof Deno.errors.AlreadyExists) {
			throw new ContentEditError(`version ${version} of ${pkg} already exists`);
		}
		throw e;
	}
	return dir;
}
