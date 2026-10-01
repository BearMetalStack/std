/**
 * @module
 * Turning arbitrary keys (titles, absolute paths, user input) into file names
 * that every file system accepts and no two keys share.
 */

const encoder = new TextEncoder();

/**
 * 64-bit FNV-1a of `input`, as 16 hex digits. Synchronous and dependency-free;
 * this names files, it is not a security boundary.
 */
export function fnv1a64(input: string): string {
	const prime = 0x100000001b3n;
	const mask = 0xffffffffffffffffn;
	let hash = 0xcbf29ce484222325n;
	for (const byte of encoder.encode(input)) {
		hash = ((hash ^ BigInt(byte)) * prime) & mask;
	}
	return hash.toString(16).padStart(16, "0");
}

/**
 * A file-system-safe name for `key`: a readable slug (so a human browsing the
 * directory can tell sets apart) followed by a hash of the exact key (so two
 * keys that slug alike, or differ only in case on a case-insensitive file
 * system, still never share a name).
 */
export function keyName(key: string): string {
	const slug = key
		.split(/[\\/]/).filter(Boolean).at(-1)
		?.replace(/[^A-Za-z0-9._-]+/g, "_")
		.replace(/^[._]+/, "")
		.slice(0, 40) ?? "";
	return `${slug ? `${slug}-` : ""}${fnv1a64(key)}`;
}
