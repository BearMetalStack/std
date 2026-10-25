/**
 * Changes to the content tree that keep its numbering intact: adding a page or section between
 * two others, respacing a directory, cutting a version. Paths in arguments are written in slugs
 * (`packages/core/0.9/reference/signal`), so nobody types a number to find a file.
 */

import { join } from "@std/path";
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
}

async function entries(dir: string, kind: "page" | "section"): Promise<Entry[]> {
	const out: Entry[] = [];
	for await (const e of Deno.readDir(dir)) {
		if (e.name.startsWith(".") || e.name === "index.md") continue;
		if (kind === "page" ? e.isFile && e.name.endsWith(".md") : e.isDirectory) {
			out.push({ name: e.name, parsed: parseName(e.name) });
		}
	}
	return out.sort((a, b) => a.parsed.order - b.parsed.order || (a.name < b.name ? -1 : 1));
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
	dir: string,
	kind: "page" | "section",
	position: Position = {},
	reindexIfFull = false,
): Promise<number> {
	const list = (await entries(dir, kind)).filter((e) => e.parsed.numbered);
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

/**
 * Writes a stub page at `slugPath` (`guides/start-here/deploying`): the last segment is the new
 * page's slug, the rest names an existing section. Returns the file written.
 */
export async function newPage(
	root: string,
	slugPath: string,
	options: Position & { title?: string; reindex?: boolean } = {},
): Promise<string> {
	const parts = slugPath.split("/").filter(Boolean);
	const slug = parts.pop();
	if (!slug) throw new ContentEditError("give a path ending in the new page's slug");
	const dir = await resolveDir(root, parts.join("/"));
	if ((await entries(dir, "page")).some((e) => e.parsed.slug === slug)) {
		throw new ContentEditError(`"${slug}" already exists in ${dir}`);
	}
	const n = await numberFor(dir, "page", options, options.reindex);
	const file = join(dir, formatName(n, slug, { ext: ".md" }));
	const title = options.title ?? slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
	await Deno.writeTextFile(file, `---\ndraft: true\n---\n\n# ${title}\n`, { createNew: true });
	return file;
}

/** Creates a section directory at `slugPath`, optionally with an icon. Returns the directory. */
export async function newSection(
	root: string,
	slugPath: string,
	options: Position & { icon?: string; reindex?: boolean } = {},
): Promise<string> {
	const parts = slugPath.split("/").filter(Boolean);
	const slug = parts.pop();
	if (!slug) throw new ContentEditError("give a path ending in the new section's slug");
	const parent = await resolveDir(root, parts.join("/"));
	if ((await entries(parent, "section")).some((e) => e.parsed.slug === slug)) {
		throw new ContentEditError(`"${slug}" already exists in ${parent}`);
	}
	const n = await numberFor(parent, "section", options, options.reindex);
	const dir = join(parent, formatName(n, slug, { icon: options.icon }));
	await Deno.mkdir(dir);
	return dir;
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
