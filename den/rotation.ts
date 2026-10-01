/**
 * @module
 * Rotating file sets: numbered-by-time snapshots of one thing (backups of a
 * document, say), pruned to the newest `keep`.
 */

import { DenError } from "./errors.ts";
import { keyName } from "./hash.ts";
import type { DenDirHandle } from "./dir.ts";
import type { DenFile, DenRotation, DenRotationEntry, DenRotationOptions } from "./types.ts";

/** `2026-09-30T14:03:22.123Z` → `20260930T140322123Z`: sortable, and legal on Windows. */
function stampOf(date: Date): string {
	return date.toISOString().replace(/[-:.]/g, "");
}

const STAMP = /^(\d{8}T\d{9}Z)-(\d{3})(?:\.|$)/;

function dateOf(stamp: string): Date {
	const m = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/)!;
	return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}Z`);
}

/** Implementation of {@linkcode DenRotation}. Build these with `dir.rotation(key)`. */
export class DenRotationHandle implements DenRotation {
	readonly key: string;
	readonly keep: number;
	readonly dir: DenDirHandle;
	readonly #extension: string;

	constructor(parent: DenDirHandle, key: string, options: DenRotationOptions = {}) {
		if (typeof key !== "string" || !key) throw new DenError("a rotation needs a non-empty key");
		const keep = options.keep ?? 5;
		if (!Number.isInteger(keep) || keep < 1) {
			throw new RangeError(`keep must be a positive integer, got ${keep}`);
		}
		this.key = key;
		this.keep = keep;
		this.dir = parent.dir(keyName(key));
		this.#extension = (options.extension ?? "bak").replace(/^\./, "");
	}

	async list(): Promise<DenRotationEntry[]> {
		const entries: DenRotationEntry[] = [];
		for (const entry of await this.dir.list()) {
			if (!entry.isFile) continue;
			const m = entry.name.match(STAMP);
			if (!m) continue;
			entries.push({
				name: entry.name,
				date: dateOf(m[1]),
				file: this.dir.file(entry.name),
			});
		}
		return entries.sort((a, b) => a.name < b.name ? 1 : a.name > b.name ? -1 : 0);
	}

	async latest(): Promise<DenFile | undefined> {
		return (await this.list())[0]?.file;
	}

	async push(content: string | Uint8Array): Promise<DenFile> {
		const temp = await this.#temp();
		try {
			await Deno.writeFile(
				temp,
				typeof content === "string" ? new TextEncoder().encode(content) : content,
				{ mode: 0o600 },
			);
			return await this.#commit(temp);
		} finally {
			await Deno.remove(temp).catch(() => {});
		}
	}

	async pushFile(source: string | URL): Promise<DenFile> {
		const temp = await this.#temp();
		try {
			await Deno.copyFile(source, temp);
			return await this.#commit(temp);
		} finally {
			await Deno.remove(temp).catch(() => {});
		}
	}

	async prune(): Promise<DenRotationEntry[]> {
		const stale = (await this.list()).slice(this.keep);
		await Promise.all(stale.map((entry) => entry.file.remove()));
		return stale;
	}

	async clear(): Promise<void> {
		await this.dir.remove();
	}

	async #temp(): Promise<string> {
		await this.dir.ensure();
		return this.dir.file(`.${crypto.randomUUID()}.tmp`).path;
	}

	/**
	 * Gives the finished temp file its name in the set. The sequence number
	 * breaks ties within one millisecond and stays fixed-width so names keep
	 * sorting by time. Hard-linking claims a name without clobbering one a
	 * concurrent push got to first; where links are unsupported, a rename onto
	 * a name that was free a moment ago is the fallback.
	 */
	async #commit(temp: string): Promise<DenFile> {
		const stamp = stampOf(new Date());
		const ext = this.#extension ? `.${this.#extension}` : "";
		let linkable = true;
		for (let seq = 0; seq < 1000; seq++) {
			const file = this.dir.file(`${stamp}-${String(seq).padStart(3, "0")}${ext}`);
			if (linkable) {
				try {
					await Deno.link(temp, file.path);
					await this.prune();
					return file;
				} catch (error) {
					if (error instanceof Deno.errors.AlreadyExists) continue;
					linkable = false;
				}
			}
			if (await file.exists()) continue;
			await Deno.rename(temp, file.path);
			await this.prune();
			return file;
		}
		throw new DenError(`more than 1000 entries pushed to ${this.dir.path} in one millisecond`);
	}
}
