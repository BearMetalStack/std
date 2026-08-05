/**
 * @module
 * Path arithmetic. Two flavours, deliberately: {@linkcode joinFor} builds paths
 * for a *named* platform, so a layout can be resolved (and tested) for Windows
 * from Linux, while {@linkcode joinSegments} builds paths for the *host*, which
 * is the only platform whose file system we can actually touch.
 */

import { isAbsolute, join, toFileUrl } from "@std/path";
import { DenPathError } from "./errors.ts";
import type { DenPlatform } from "./types.ts";

/** The host platform, normalised to one den has a layout for. */
export function hostPlatform(): DenPlatform {
	const os = "Deno" in globalThis ? Deno.build?.os : undefined;
	return os === "windows" || os === "darwin" ? os : "linux";
}

const SEPARATORS: Record<DenPlatform, string> = {
	windows: "\\",
	darwin: "/",
	linux: "/",
};

/** Joins path parts using `platform`'s separator, regardless of the host. */
export function joinFor(platform: DenPlatform, base: string, ...parts: string[]): string {
	const sep = SEPARATORS[platform];
	let path = base.replace(/[\\/]+$/, "");
	for (const part of parts) {
		const trimmed = part.replace(/^[\\/]+|[\\/]+$/g, "");
		if (trimmed) path += sep + trimmed;
	}
	return path;
}

/** Whether a path is absolute on `platform`, again regardless of the host. */
export function isAbsoluteFor(platform: DenPlatform, path: string): boolean {
	if (platform === "windows") return /^([a-zA-Z]:[\\/]|[\\/]{2})/.test(path);
	return path.startsWith("/");
}

/**
 * Appends user-supplied segments to a directory, on the host platform.
 *
 * Segments may contain `/` (or `\`) and are split on it, so `file("a/b.json")`
 * and `file("a", "b.json")` are the same thing. What they may never do is leave
 * the directory: `..`, an absolute path, or an embedded NUL throws
 * {@linkcode DenPathError}. Handles are frequently built from names that came
 * from a user, a config file, or a network request, and "cache.file(key)" must
 * not be a way to write to `/etc`.
 */
export function joinSegments(base: string, segments: string[]): string {
	const parts: string[] = [];

	for (const segment of segments) {
		if (typeof segment !== "string") {
			throw new DenPathError(`path segment must be a string, got ${typeof segment}`);
		}
		if (segment.includes("\0")) {
			throw new DenPathError("path segment contains a NUL byte");
		}
		if (isAbsolute(segment) || isAbsoluteFor("windows", segment)) {
			throw new DenPathError(`path segment "${segment}" is absolute; use a relative name`);
		}
		for (const part of segment.split(/[\\/]+/)) {
			if (part === "" || part === ".") continue;
			if (part === "..") {
				throw new DenPathError(`path segment "${segment}" escapes its directory`);
			}
			parts.push(part);
		}
	}

	return parts.length === 0 ? base : join(base, ...parts);
}

/** The parent directory of a path, on the host platform. */
export function parentOf(path: string): string {
	const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	if (idx <= 0) return path.slice(0, idx + 1) || ".";
	return path.slice(0, idx);
}

/** A `file:` URL for a path, with a trailing slash when it names a directory. */
export function urlFor(path: string, directory = false): URL {
	const url = toFileUrl(isAbsolute(path) ? path : join(Deno.cwd(), path));
	if (directory && !url.pathname.endsWith("/")) url.pathname += "/";
	return url;
}
