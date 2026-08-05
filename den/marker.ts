/**
 * @module
 * Directory ownership. Every directory den bootstraps gets a small marker file
 * naming the app that claimed it, so the next run can tell "my config
 * directory" apart from "somebody else's directory that happens to resolve to
 * the same path".
 *
 * Collisions are not hypothetical. Two apps can pick the same name; a
 * `BEARMETAL_DEN_CONFIG_DIR` can point somewhere already occupied; a `dirs` override can
 * quietly land two kinds on one path. None of those announce themselves — you
 * find out when an app reads someone else's settings, or clears them.
 */

import { joinSegments } from "./paths.ts";
import type { DenDirKind, DenOwner, DenOwnership } from "./types.ts";

/** Name of the ownership marker den writes into each directory it claims. */
export const MARKER = ".bearmetal_den";

/** Schema version of the marker file. */
export const MARKER_VERSION = 1;

function isMissing(error: unknown): boolean {
	return error instanceof Deno.errors.NotFound;
}

/** The marker's path inside a directory. */
export function markerPath(dir: string): string {
	return joinSegments(dir, [MARKER]);
}

/** Reads a directory's marker, or `undefined` when absent or unreadable. */
export async function readOwner(dir: string): Promise<DenOwner | undefined> {
	let text: string;
	try {
		text = await Deno.readTextFile(markerPath(dir));
	} catch {
		return undefined;
	}

	try {
		const parsed = JSON.parse(text) as Partial<DenOwner>;
		if (typeof parsed?.app !== "string" || !parsed.app) return undefined;
		return parsed as DenOwner;
	} catch {
		return undefined; // a corrupt marker is treated as no marker, never as a conflict
	}
}

/** Writes a directory's marker, creating the directory if needed. */
export async function writeOwner(dir: string, owner: DenOwner): Promise<void> {
	await Deno.mkdir(dir, { recursive: true });
	await Deno.writeTextFile(
		markerPath(dir),
		JSON.stringify(owner, null, "\t") + "\n",
	);
}

/** Whether a marker describes the same app and kind we are asking about. */
function matches(owner: DenOwner, app: string, org: string | undefined, kind: DenDirKind): boolean {
	return owner.app === app && (owner.org ?? undefined) === org && owner.kind === kind;
}

/** Whether a directory holds anything other than den's own marker. */
async function hasContent(dir: string): Promise<boolean> {
	try {
		for await (const entry of Deno.readDir(dir)) {
			if (entry.name !== MARKER) return true;
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Classifies one directory without changing anything.
 *
 * - `absent` — nothing there yet; whoever claims it first owns it
 * - `owned` — claimed by this app, for this kind
 * - `unmarked` — exists but empty, so claiming it is harmless
 * - `unclaimed` — exists with content den didn't put there
 * - `conflict` — claimed by a *different* app, org, or kind
 */
export async function inspect(
	path: string,
	kind: DenDirKind,
	app: string,
	org: string | undefined,
): Promise<DenOwnership> {
	let isDirectory: boolean;
	try {
		isDirectory = (await Deno.stat(path)).isDirectory;
	} catch (error) {
		if (isMissing(error)) return { kind, path, status: "absent" };
		throw error;
	}

	if (!isDirectory) {
		return {
			kind,
			path,
			status: "conflict",
			message: `${path} is a file, not a directory`,
		};
	}

	const owner = await readOwner(path);
	if (owner) {
		if (matches(owner, app, org, kind)) return { kind, path, status: "owned", owner };
		const who = owner.org ? `${owner.org}/${owner.app}` : owner.app;
		const mine = org ? `${org}/${app}` : app;
		return {
			kind,
			path,
			status: "conflict",
			owner,
			message: owner.app === app && owner.kind !== kind
				? `${path} is ${mine}'s ${owner.kind} directory, but is also resolving as its ${kind} directory`
				: `${path} belongs to ${who} (${owner.kind}), not to ${mine}`,
		};
	}

	return await hasContent(path)
		? {
			kind,
			path,
			status: "unclaimed",
			message: `${path} already has content den didn't create; claiming it as ${kind}`,
		}
		: { kind, path, status: "unmarked" };
}

/** Builds the marker payload for a directory. */
export function owner(app: string, org: string | undefined, kind: DenDirKind): DenOwner {
	return {
		app,
		...(org ? { org } : {}),
		kind,
		den: MARKER_VERSION,
		created: new Date().toISOString(),
	};
}
