/**
 * Route-path parsing and the naming rules that map a path segment to a file, a
 * directory and an exported factory function.
 *
 * The conventions, by example:
 * - `"/api"`            → file `routes/api.ts`,        fn `apiModule`
 * - `"/api/users"`      → dir  `routes/api/`,          child file `users.ts`
 * - `"/api/users/:id"`  → file `routes/api/users/_id.ts`, fn `idModule`
 *
 * A dynamic `:param` segment becomes an `_param` file or directory, so the path
 * separator in a route never collides with the one in a filename.
 *
 * @module
 */

import { toCamelCase } from "@bearmetal/miscellanea";

/** A single path segment, e.g. `"users"`, `":id"` or `"*"`. */
export type Segment = string;

/**
 * Normalises a user-supplied path: guarantees a single leading slash, collapses
 * runs of slashes, and strips a trailing slash (except on the bare root).
 */
export function normalizePath(input: string): string {
	let path = input.trim();
	if (!path.startsWith("/")) path = "/" + path;
	path = path.replace(/\/{2,}/g, "/");
	if (path.length > 1) path = path.replace(/\/$/, "");
	return path;
}

/** The non-empty segments of a path, in order. */
export function splitSegments(path: string): Segment[] {
	return normalizePath(path).split("/").filter(Boolean);
}

/** Whether a segment is a dynamic parameter, e.g. `":id"`. */
export function isParamSegment(seg: Segment): boolean {
	return seg.startsWith(":");
}

/** Whether a segment is a catch-all wildcard. */
export function isWildcardSegment(seg: Segment): boolean {
	return seg === "*";
}

/**
 * The file/directory basename a segment is stored under.
 *
 * `":id"` → `"_id"`, `"*"` → `"_wildcard"`, everything else unchanged.
 */
export function segmentToFileName(seg: Segment): string {
	if (isWildcardSegment(seg)) return "_wildcard";
	if (isParamSegment(seg)) return "_" + seg.slice(1);
	return seg;
}

/** The inverse of {@link segmentToFileName}: a basename back to its segment. */
export function fileNameToSegment(name: string): Segment {
	const base = name.replace(/\.ts$/, "");
	if (base === "_wildcard") return "*";
	if (base.startsWith("_")) return ":" + base.slice(1);
	return base;
}

/**
 * The exported factory-function name for a segment.
 *
 * `"users"` → `"usersModule"`, `":id"` → `"idModule"`, `"user-posts"` →
 * `"userPostsModule"`.
 */
export function moduleFnName(seg: Segment): string {
	const clean = seg.replace(/^[:*]/, "") || "root";
	return toCamelCase(clean) + "Module";
}

/** The route path a node declares for itself, e.g. `"users"` → `"/users"`. */
export function ownRoutePath(seg: Segment): string {
	return "/" + seg;
}

/** Matches a single valid segment: an optional `:`/`*` marker then a name. */
const SEGMENT_RE = /^(?:\*|:?[A-Za-z0-9][A-Za-z0-9_.-]*)$/;

/**
 * Validates a path, throwing a descriptive error on anything the generator
 * cannot turn into files. Returns the normalised path on success.
 */
export function validatePath(input: string): string {
	const path = normalizePath(input);
	const segments = splitSegments(path);
	if (segments.length === 0) {
		throw new Error(`"${input}" has no path segments — nothing to generate`);
	}
	for (const seg of segments) {
		if (!SEGMENT_RE.test(seg)) {
			throw new Error(
				`Invalid path segment "${seg}" in "${input}". Segments may contain ` +
					`letters, digits, "-", "_" and ".", optionally prefixed with ":" for a ` +
					`parameter, or be a lone "*" wildcard.`,
			);
		}
	}
	return path;
}

/** The default leaf filename (no extension) for the last segment of a path. */
export function defaultFilename(path: string): string {
	const segments = splitSegments(path);
	return segmentToFileName(segments[segments.length - 1]);
}

/**
 * A relative module specifier from one absolute file to another, e.g. from
 * `/app/routes/api/mod.ts` to `/app/schemas.ts` → `"../../schemas.ts"`.
 */
export function relativeSpecifier(fromFile: string, toFile: string): string {
	const from = fromFile.split("/").filter(Boolean);
	const to = toFile.split("/").filter(Boolean);
	const fromDir = from.slice(0, -1);
	let common = 0;
	while (common < fromDir.length && common < to.length && fromDir[common] === to[common]) {
		common++;
	}
	const ups = fromDir.slice(common).map(() => "..");
	const downs = to.slice(common);
	const rel = [...ups, ...downs].join("/");
	return rel.startsWith(".") ? rel : "./" + rel;
}
