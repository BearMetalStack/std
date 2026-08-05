/**
 * @module
 * The directory handle. Like {@linkcode DenFileHandle}, it is inert until a
 * method is called — constructing `den().cache.dir("thumbs")` touches nothing.
 */

import { DenOwnershipError } from "./errors.ts";
import { fileAt } from "./file.ts";
import type { DenFileHandle, FileOptions } from "./file.ts";
import { inspect, MARKER, owner as buildOwner, readOwner, writeOwner } from "./marker.ts";
import { joinSegments, urlFor } from "./paths.ts";
import type { DenDir, DenDirKind, DenOwner, DenOwnership } from "./types.ts";

function isMissing(error: unknown): boolean {
	return error instanceof Deno.errors.NotFound;
}

/** Identity a handle needs before it can claim or defend a directory. */
export type DirOwnership = { app: string; org?: string; kind: DenDirKind };

/** Options for {@linkcode DenDirHandle}. */
export type DirOptions = FileOptions & {
	/**
	 * Set on the six top-level kind directories, so they can be claimed and
	 * checked. Deliberately *not* inherited by `.dir()` children — a marker
	 * means "den bootstrapped this directory", and nested application data is
	 * the app's own business.
	 */
	ownership?: DirOwnership;
};

/** Implementation of {@linkcode DenDir}. */
export class DenDirHandle implements DenDir {
	readonly path: string;
	readonly #options: DirOptions;

	constructor(path: string, options: DirOptions = {}) {
		this.path = path;
		this.#options = options;
	}

	get url(): URL {
		return urlFor(this.path, true);
	}

	file<T = unknown>(...segments: string[]): DenFileHandle<T> {
		return fileAt<T>(this.path, segments, this.#options);
	}

	dir(...segments: string[]): DenDirHandle {
		const { ownership: _, ...inherited } = this.#options;
		return new DenDirHandle(joinSegments(this.path, segments), inherited);
	}

	async exists(): Promise<boolean> {
		try {
			return (await Deno.stat(this.path)).isDirectory;
		} catch (error) {
			if (isMissing(error)) return false;
			throw error;
		}
	}

	async ensure(): Promise<this> {
		await Deno.mkdir(this.path, { recursive: true });
		return this;
	}

	/** Direct children, minus den's own marker file. */
	async list(): Promise<Deno.DirEntry[]> {
		try {
			const entries = await Array.fromAsync(Deno.readDir(this.path));
			return entries.filter((entry) => entry.name !== MARKER);
		} catch (error) {
			if (isMissing(error)) return [];
			throw error;
		}
	}

	/** Depth-first descendant files, as paths relative to this directory. */
	async *walk(prefix = ""): AsyncIterableIterator<string> {
		for (const entry of await this.list()) {
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory) yield* this.dir(entry.name).walk(relative);
			else yield relative;
		}
	}

	/**
	 * Clears the directory's contents. The ownership marker survives, because
	 * emptying a directory is not disowning it.
	 */
	async empty(options: { force?: boolean } = {}): Promise<void> {
		await this.#assertOurs("empty", options.force);
		for (const entry of await this.list()) {
			await Deno.remove(joinSegments(this.path, [entry.name]), { recursive: true });
		}
	}

	async remove(options: { force?: boolean } = {}): Promise<void> {
		await this.#assertOurs("remove", options.force);
		try {
			await Deno.remove(this.path, { recursive: true });
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}

	owner(): Promise<DenOwner | undefined> {
		return readOwner(this.path);
	}

	inspect(): Promise<DenOwnership> {
		const ownership = this.#ownership("inspect");
		return inspect(this.path, ownership.kind, ownership.app, ownership.org);
	}

	async claim(): Promise<this> {
		const { app, org, kind } = this.#ownership("claim");
		const existing = await readOwner(this.path);
		// Never overwrite another app's marker; that is how you launder a
		// collision into an ownership change nobody notices.
		if (existing && existing.app === app && existing.kind === kind) return this;
		if (existing) {
			throw new DenOwnershipError(
				`${this.path} is claimed by ${existing.org ? `${existing.org}/` : ""}${existing.app} ` +
					`(${existing.kind}); refusing to reclaim it as ${kind}`,
			);
		}
		await writeOwner(this.path, buildOwner(app, org, kind));
		return this;
	}

	#ownership(operation: string): DirOwnership {
		const ownership = this.#options.ownership;
		if (!ownership) {
			throw new DenOwnershipError(
				`cannot ${operation} ${this.path}: only the six top-level directories carry ownership`,
			);
		}
		return ownership;
	}

	/**
	 * Destructive operations refuse to run against a directory another app has
	 * claimed. An unmarked directory is fair game — den only defends what it can
	 * prove belongs to somebody else.
	 */
	async #assertOurs(operation: string, force = false): Promise<void> {
		const ownership = this.#options.ownership;
		if (force || !ownership) return;

		const existing = await readOwner(this.path);
		if (!existing) return;
		if (existing.app === ownership.app && (existing.org ?? undefined) === ownership.org) return;

		const who = existing.org ? `${existing.org}/${existing.app}` : existing.app;
		throw new DenOwnershipError(
			`refusing to ${operation} ${this.path}: it belongs to ${who} (${existing.kind}). ` +
				`Pass { force: true } if you really mean it.`,
		);
	}
}
