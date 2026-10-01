/**
 * @module
 * Advisory locks: "only one process works on this at a time", for things like
 * a document two instances of an app (or an app and its CLI) could both open.
 *
 * A lock is an OS advisory lock on a file, held for as long as the process
 * keeps it, so a crash or `kill -9` releases it and there is no stale-lock
 * reaping to get wrong. The holder's pid and a label are written into the file
 * so a loser can say who has it, and so that file systems with no advisory
 * locking at all (some network mounts) still have an answer.
 */

import { basename, dirname, fromFileUrl, join, resolve } from "@std/path";
import { keyName } from "./hash.ts";
import { hostPlatform } from "./paths.ts";
import type { DenLock, DenLockNote, DenLockOptions } from "./types.ts";

const encoder = new TextEncoder();

/**
 * A canonical spelling of `path`, so two spellings of one file take one lock:
 * resolved, symlinks followed (for as much of the path as exists), and
 * case-folded on platforms whose default file system is case-insensitive.
 */
export async function canonicalPath(path: string | URL): Promise<string> {
	const absolute = resolve(path instanceof URL ? fromFileUrl(path) : path);
	let real: string;
	try {
		real = await Deno.realPath(absolute);
	} catch {
		const parent = dirname(absolute);
		real = parent === absolute ? absolute : join(await canonicalPath(parent), basename(absolute));
	}
	const platform = hostPlatform();
	return platform === "windows" || platform === "darwin" ? real.toLowerCase() : real;
}

/** Path of the lock file for `name` inside `dir`. */
export function lockPathFor(dir: string, name: string): string {
	return resolve(dir, `${keyName(name)}.lock`);
}

/** Reads the note a lock's holder left, if there is a readable one. */
export async function readLockNote(path: string): Promise<DenLockNote | undefined> {
	try {
		const parsed = JSON.parse(await Deno.readTextFile(path));
		if (typeof parsed?.pid === "number") return parsed as DenLockNote;
	} catch {
		// Missing, empty, or half-written.
	}
	return undefined;
}

/**
 * Liveness check for file systems with no advisory locking. Errs towards
 * "still running": wrongly declaring a live holder dead means two writers.
 */
function isProcessAlive(pid: number): boolean {
	if (pid === Deno.pid) return true;
	if (Deno.build.os !== "linux") return true;
	try {
		return Deno.statSync(`/proc/${pid}`).isDirectory;
	} catch {
		return false;
	}
}

class DenLockHandle implements DenLock {
	#file: Deno.FsFile | null;

	constructor(readonly path: string, readonly name: string, file: Deno.FsFile) {
		this.#file = file;
	}

	get held(): boolean {
		return this.#file !== null;
	}

	async note(label: string): Promise<void> {
		const file = this.#file;
		if (!file) throw new Error(`lock ${this.path} has been released`);
		const note: DenLockNote = {
			pid: Deno.pid,
			since: new Date().toISOString(),
			label,
		};
		await file.truncate(0);
		await file.seek(0, Deno.SeekMode.Start);
		await file.write(encoder.encode(JSON.stringify(note)));
	}

	async release(options: { remove?: boolean } = {}): Promise<void> {
		const file = this.#file;
		if (!file) return;
		this.#file = null;
		// Unlinking while the lock is still held is what keeps this race-free:
		// anyone who opened the old file before the unlink finds, once they get
		// the lock, that it is no longer the file at `path`, and starts over.
		if (options.remove) await Deno.remove(this.path).catch(() => {});
		else await file.truncate(0).catch(() => {});
		try {
			await file.unlock();
		} catch {
			// Never lockable; closing settles it either way.
		}
		try {
			file.close();
		} catch {
			// Already closed.
		}
	}

	[Symbol.asyncDispose](): Promise<void> {
		return this.release();
	}
}

/** Whether `file` is still the file at `path`, not one unlinked out from under us. */
async function stillAtPath(file: Deno.FsFile, path: string): Promise<boolean> {
	try {
		const [mine, there] = await Promise.all([file.stat(), Deno.stat(path)]);
		if (mine.ino === null || there.ino === null) return true;
		return mine.ino === there.ino && mine.dev === there.dev;
	} catch {
		return false;
	}
}

/**
 * Takes the lock at `path` if nobody else holds it, else resolves `null`.
 * Never waits.
 */
export async function tryLockAt(
	path: string,
	name: string,
	options: DenLockOptions = {},
): Promise<DenLock | null> {
	await Deno.mkdir(dirname(path), { recursive: true });
	for (let attempt = 0; attempt < 8; attempt++) {
		const file = await Deno.open(path, { create: true, read: true, write: true, mode: 0o600 });
		let held: boolean;
		try {
			held = await file.tryLock(true);
		} catch {
			const note = await readLockNote(path);
			held = !note || !isProcessAlive(note.pid);
		}
		if (!held) {
			file.close();
			return null;
		}
		if (!(await stillAtPath(file, path))) {
			await file.unlock().catch(() => {});
			file.close();
			continue;
		}
		const lock = new DenLockHandle(path, name, file);
		await lock.note(options.label ?? name);
		return lock;
	}
	return null;
}
