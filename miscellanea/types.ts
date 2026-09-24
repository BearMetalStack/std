import type { Fn } from "@fn";

export type TemplateArgs = [template: TemplateStringsArray, ...substitutions: unknown[]];
export type TagFn = Fn<TemplateArgs, string>;

// deno-lint-ignore ban-types
export type DotBearmetalFile<T = {}> = {
	/** Resolves to `undefined` when the file does not exist; throws on any other read failure. */
	read(): Promise<string | undefined>;
	/** Resolves to `{}` when the file does not exist; throws when it exists but does not parse. */
	readJson<J = T>(): Promise<J>;
	write(content: string): Promise<void>;
	writeJson<J = T>(content: J): Promise<void>;
	path: string;
};
export type DotBearmetalDir = {
	read(): Promise<Deno.DirEntry[] | undefined>;
	empty(): Promise<void>;
	ensure(): Promise<void>;
};
// URL-based, read-only counterparts for use inside compiled binaries,
// where .bearmetal is embedded in the binary's read-only file system.
// `url` is null when no .bearmetal root is reachable at all.
// deno-lint-ignore ban-types
export type DotBearmetalFileUrl<T = {}> = {
	/** Resolves to `undefined` when the file does not exist; throws on any other read failure. */
	read(): Promise<string | undefined>;
	/** Resolves to `{}` when the file does not exist; throws when it exists but does not parse. */
	readJson<J = T>(): Promise<J>;
	url: URL | null;
};
export type DotBearmetalDirUrl = {
	read(): Promise<Deno.DirEntry[] | undefined>;
	url: URL | null;
};
export type DotBearmetalUrlOptions = {
	/** Module URL to anchor the embedded-filesystem search on, typically `import.meta.url`. */
	base?: string | URL;
	/** Whether to also consider a real `.bearmetal` found by walking up from `Deno.cwd()`. Defaults to true. */
	searchCwd?: boolean;
};
export type DotBearmetalNamespace = string | string[];
export type DotBearmetalNamespaceManifest = {
	primary: string;
	[key: string]: string[] | string;
};

/**
 * A string to compare, or a pre-split sequence of units. Strings are compared by code point, so a
 * surrogate pair (most emoji, astral-plane scripts) counts as one character rather than two. Pass an
 * array to pick a different unit — e.g. grapheme clusters from `Intl.Segmenter`, which is what it
 * takes for `e` + a combining accent to count as one character.
 */
export type EditDistanceInput = string | readonly string[];

/** Options for {@linkcode levenshteinDistance} and {@linkcode damerauLevenshteinDistance}. */
export interface EditDistanceOptions {
	/**
	 * Stop as soon as the distance is known to exceed this and return `maxDistance + 1`. Callers
	 * that only care whether two strings are "close enough" skip most of the work on the ones that
	 * aren't.
	 */
	maxDistance?: number;
}
