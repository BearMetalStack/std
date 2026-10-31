/**
 * Drafts a changelog entry from git history. Commits are read since the package's last release
 * tag (`<name>@<version>`, as `workspace:bump-versions` writes them) and kept when their
 * conventional-commit scope names the package. The result is a starting point to edit, not a
 * finished entry.
 */

import { basename, join } from "@std/path";
import type { ChangeType } from "../types.ts";
import { ContentEditError, type VersionOptions } from "./edit.ts";
import { compareVersions, findWorkspace, linkPackage } from "./workspace.ts";
import { splitFrontmatter } from "@bearmetal/clawmark";

/** One commit, as read from `git log`. */
export interface Commit {
	subject: string;
	body: string;
}

/** A commit turned into a changelog line. */
export interface DraftChange {
	type: ChangeType;
	text: string;
}

const TYPES: Record<string, ChangeType | null> = {
	feat: "added",
	fix: "fixed",
	refactor: "changed",
	perf: "changed",
	revert: "changed",
	deprecate: "deprecated",
	docs: null,
	chore: null,
	test: null,
	style: null,
	ci: null,
	build: null,
};
const SUBJECT = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

/**
 * The changes `commits` hold for a package known by any of `scopes`. Commits with another scope,
 * no scope, or a type that doesn't reach readers (`docs`, `chore`, `test`…) are dropped; `!` or a
 * `BREAKING CHANGE` footer makes a change breaking.
 */
export function changesFrom(commits: Commit[], scopes: string[]): DraftChange[] {
	const out: DraftChange[] = [];
	for (const { subject, body } of commits) {
		const m = SUBJECT.exec(subject.trim());
		if (!m) continue;
		const [, kind, scope = "", bang, text] = m;
		if (!scope.split(",").map((s) => s.trim()).some((s) => scopes.includes(s))) continue;
		const mapped = TYPES[kind] === undefined ? "changed" : TYPES[kind];
		if (mapped === null) continue;
		const breaking = !!bang || /^BREAKING[ -]CHANGE:/m.test(body);
		out.push({ type: breaking ? "breaking" : mapped, text });
	}
	return out;
}

/** The changelog file for `changes`: a `date`, then one `- type: text` line each. */
export function formatChangelog(changes: DraftChange[], date: Date): string {
	const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
	const lines = changes.map((c) => `- ${c.type}: ${c.text}`);
	return `---\ndate: ${day}\n---\n\n${lines.join("\n")}\n`;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
	const out = await new Deno.Command("git", { args, cwd, stdout: "piped", stderr: "piped" })
		.output();
	if (!out.success) {
		throw new ContentEditError(`git ${args[0]} failed: ${new TextDecoder().decode(out.stderr)}`);
	}
	return new TextDecoder().decode(out.stdout);
}

/** Options for {@linkcode draftChangelog}. */
export interface ChangelogOptions extends VersionOptions {
	/** The release this entry is for. Defaults to the package's `deno.json` version if untagged. */
	version?: string;
	/** Replace an existing entry. */
	force?: boolean;
	/** The date written into the entry. Defaults to today, or the tag's date for a tagged release. */
	date?: Date;
}

/** What {@linkcode draftChangelog} wrote. */
export interface ChangelogDraft {
	file: string;
	version: string;
	/** The tag the commits were read from, if there was one. */
	since?: string;
	changes: DraftChange[];
}

/**
 * Writes `packages/<pkg>/changelog/<version>.md` from the commits scoped to `pkg` since its last
 * release tag. An already-tagged `version` reads up to its own tag and takes its date, which is how
 * past releases are backfilled. Refuses when the version is already tagged (those commits belong to the next
 * release; pass `version`), when nothing reaches readers, or when the file exists (pass `force`).
 */
export async function draftChangelog(
	root: string,
	pkg: string,
	options: ChangelogOptions = {},
): Promise<ChangelogDraft> {
	let override: string | undefined;
	try {
		const meta = splitFrontmatter(
			await Deno.readTextFile(join(root, "packages", pkg, "index.md")),
		).data as Record<string, unknown>;
		override = meta.package ? String(meta.package) : undefined;
	} catch (e) {
		if (!(e instanceof Deno.errors.NotFound)) throw e;
	}
	const workspace = options.workspace !== undefined ? options.workspace : await findWorkspace(root);
	const source = linkPackage(workspace, pkg, override);
	if (!source) {
		throw new ContentEditError(
			`"${pkg}" isn't linked to a workspace package, so there are no tags or commits to read`,
		);
	}

	const tags = (await git(source.dir, "tag", "-l", `${source.name}@*`)).split("\n")
		.map((t) => t.trim()).filter(Boolean)
		.map((t) => t.slice(source.name.length + 1))
		.sort(compareVersions);
	const version = options.version ?? source.version;
	if (!version) throw new ContentEditError(`${source.name} has no version; pass --version`);
	if (!options.version && tags.includes(version)) {
		throw new ContentEditError(
			`${source.name}@${version} is already tagged, so newer commits belong to the next ` +
				"release; pass --version",
		);
	}
	const previous = tags.filter((t) => compareVersions(t, version) < 0).at(-1);
	const since = previous && `${source.name}@${previous}`;
	const until = tags.includes(version) ? `${source.name}@${version}` : "HEAD";

	const log = await git(
		source.dir,
		"log",
		"--format=%s%x1f%b%x1e",
		since ? `${since}..${until}` : until,
	);
	const commits = log.split("\x1e").map((r) => r.trim()).filter(Boolean).map((r) => {
		const [subject, body = ""] = r.split("\x1f");
		return { subject, body };
	}).reverse();
	const scopes = [...new Set([pkg, basename(source.dir), source.name.split("/").at(-1)!])];
	const changes = changesFrom(commits, scopes);
	if (!changes.length) {
		throw new ContentEditError(
			`no commits scoped to ${scopes.join("/")} since ${since ?? "the beginning"}`,
		);
	}

	const dir = join(root, "packages", pkg, "changelog");
	await Deno.mkdir(dir, { recursive: true });
	const file = join(dir, `${version}.md`);
	const date = options.date ??
		(until === "HEAD"
			? new Date()
			: new Date((await git(source.dir, "log", "-1", "--format=%cI", until)).trim()));
	await Deno.writeTextFile(file, formatChangelog(changes, date), {
		createNew: !options.force,
	}).catch((e) => {
		if (e instanceof Deno.errors.AlreadyExists) {
			throw new ContentEditError(`${file} already exists; pass --force to replace it`);
		}
		throw e;
	});
	return { file, version, since, changes };
}
