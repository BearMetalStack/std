/**
 * @module
 * The directory handle. Like {@linkcode DenFileHandle}, it is inert until a
 * method is called — constructing `den().cache.dir("thumbs")` touches nothing.
 */

import { fileAt } from "./file.ts";
import type { DenFileHandle, FileOptions } from "./file.ts";
import { joinSegments, urlFor } from "./paths.ts";
import type { DenDir } from "./types.ts";

function isMissing(error: unknown): boolean {
	return error instanceof Deno.errors.NotFound;
}

/** Implementation of {@linkcode DenDir}. */
export class DenDirHandle implements DenDir {
	readonly path: string;
	readonly #options: FileOptions;

	constructor(path: string, options: FileOptions = {}) {
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
		return new DenDirHandle(joinSegments(this.path, segments), this.#options);
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

	async list(): Promise<Deno.DirEntry[]> {
		try {
			return await Array.fromAsync(Deno.readDir(this.path));
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

	async empty(): Promise<void> {
		for (const entry of await this.list()) {
			await Deno.remove(joinSegments(this.path, [entry.name]), { recursive: true });
		}
	}

	async remove(): Promise<void> {
		try {
			await Deno.remove(this.path, { recursive: true });
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}
}
