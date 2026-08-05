/**
 * @module
 * The file handle. Construct it, read it, write into it, flush it.
 *
 * A handle is just a path plus two slots: whatever was last read off the disk,
 * and whatever has been staged for writing. `set`/`setJson`/`update` stage;
 * `flush` persists; `write`/`writeJson` do both. Reads see staged content, so a
 * handle behaves like the file you're in the middle of editing rather than like
 * the file on disk.
 */

import { DenError } from "./errors.ts";
import { joinSegments, parentOf, urlFor } from "./paths.ts";
import type { DenFile } from "./types.ts";

/** Knobs shared by every handle a {@linkcode Den} hands out. */
export type FileOptions = {
	/** Write via temp file + rename so readers never observe a partial file. */
	atomic?: boolean;
	/** Indentation for {@linkcode DenFileHandle.setJson}. Defaults to a tab. */
	jsonIndent?: string | number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function isMissing(error: unknown): boolean {
	return error instanceof Deno.errors.NotFound;
}

function toBytes(content: string | Uint8Array): Uint8Array {
	return typeof content === "string" ? encoder.encode(content) : content;
}

/** Implementation of {@linkcode DenFile}. Build these with `dir.file(...)`. */
export class DenFileHandle<T = unknown> implements DenFile<T> {
	readonly path: string;
	readonly #atomic: boolean;
	readonly #jsonIndent: string | number;

	/** Content staged by set/setJson/update, awaiting a flush. */
	#staged: Uint8Array | null = null;
	/** Last content read off the disk, so repeat reads don't re-hit it. */
	#cached: Uint8Array | null = null;
	#cacheValid = false;

	constructor(path: string, options: FileOptions = {}) {
		this.path = path;
		this.#atomic = options.atomic ?? true;
		this.#jsonIndent = options.jsonIndent ?? "\t";
	}

	get url(): URL {
		return urlFor(this.path);
	}

	get dirty(): boolean {
		return this.#staged !== null;
	}

	async exists(): Promise<boolean> {
		return (await this.stat()) !== undefined;
	}

	async stat(): Promise<Deno.FileInfo | undefined> {
		try {
			return await Deno.stat(this.path);
		} catch (error) {
			if (isMissing(error)) return undefined;
			throw error;
		}
	}

	/** Staged bytes, else the cached read, else a fresh read. */
	async #bytes(): Promise<Uint8Array | undefined> {
		if (this.#staged) return this.#staged;
		if (this.#cacheValid) return this.#cached ?? undefined;

		try {
			this.#cached = await Deno.readFile(this.path);
		} catch (error) {
			if (!isMissing(error)) throw error;
			this.#cached = null;
		}
		this.#cacheValid = true;
		return this.#cached ?? undefined;
	}

	async read(): Promise<string | undefined> {
		const bytes = await this.#bytes();
		return bytes && decoder.decode(bytes);
	}

	async readBytes(): Promise<Uint8Array | undefined> {
		const bytes = await this.#bytes();
		return bytes && bytes.slice();
	}

	readJson<J = T>(): Promise<J | undefined>;
	readJson<J = T>(fallback: J): Promise<J>;
	async readJson<J = T>(fallback?: J): Promise<J | undefined> {
		const text = await this.read();
		if (text === undefined) return fallback;
		try {
			return JSON.parse(text) as J;
		} catch {
			return fallback;
		}
	}

	set(content: string | Uint8Array): this {
		this.#staged = toBytes(content);
		return this;
	}

	setJson<J = T>(value: J): this {
		return this.set(JSON.stringify(value, null, this.#jsonIndent) + "\n");
	}

	async update<J = T>(fn: (current: J | undefined) => J | Promise<J>): Promise<this> {
		return this.setJson(await fn(await this.readJson<J>()));
	}

	discard(): this {
		this.#staged = null;
		return this;
	}

	async write(content: string | Uint8Array): Promise<void> {
		await this.set(content).flush();
	}

	async writeJson<J = T>(value: J): Promise<void> {
		await this.setJson(value).flush();
	}

	async append(content: string | Uint8Array): Promise<void> {
		await this.flush();
		await this.#ensureParent();
		await Deno.writeFile(this.path, toBytes(content), { append: true, create: true });
		this.#invalidate();
	}

	async flush(): Promise<void> {
		const staged = this.#staged;
		if (staged === null) return;

		await this.#ensureParent();
		if (this.#atomic) await this.#writeAtomic(staged);
		else await Deno.writeFile(this.path, staged);

		this.#staged = null;
		this.#cached = staged;
		this.#cacheValid = true;
	}

	reload(): this {
		this.#staged = null;
		this.#invalidate();
		return this;
	}

	async remove(): Promise<void> {
		this.#staged = null;
		this.#invalidate();
		try {
			await Deno.remove(this.path);
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}

	async [Symbol.asyncDispose](): Promise<void> {
		await this.flush();
	}

	#invalidate(): void {
		this.#cached = null;
		this.#cacheValid = false;
	}

	#ensureParent(): Promise<void> {
		return Deno.mkdir(parentOf(this.path), { recursive: true });
	}

	/**
	 * Write to a sibling temp file, then rename over the target. The rename is
	 * atomic within a directory on every platform den supports, so a concurrent
	 * reader sees either the old file or the new one — never a truncated one.
	 */
	async #writeAtomic(bytes: Uint8Array): Promise<void> {
		const temp = `${this.path}.${crypto.randomUUID().slice(0, 8)}.tmp`;
		// A rename replaces the target's permissions along with its contents, so
		// carry the existing mode over rather than silently re-privatising a file
		// the user chmod'd. New files start private; this is the user's own data.
		const existing = await this.stat();
		const mode = existing?.mode == null ? 0o600 : existing.mode & 0o777;
		try {
			await Deno.writeFile(temp, bytes, { mode });
			await Deno.rename(temp, this.path);
		} catch (error) {
			await Deno.remove(temp).catch(() => {});
			throw new DenError(`failed to write ${this.path}: ${(error as Error).message}`, {
				cause: error,
			});
		}
	}
}

/** Builds a handle for `segments` under `base`. */
export function fileAt<T = unknown>(
	base: string,
	segments: string[],
	options: FileOptions = {},
): DenFileHandle<T> {
	return new DenFileHandle<T>(joinSegments(base, segments), options);
}
