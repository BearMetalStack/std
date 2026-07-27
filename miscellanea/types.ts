import type { Fn } from "@fn";

export type TemplateArgs = [template: TemplateStringsArray, ...substitutions: unknown[]];
export type TagFn = Fn<TemplateArgs, string>;

// deno-lint-ignore ban-types
export type DotBearmetalFile<T = {}> = {
	read(): Promise<string> | undefined;
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
	read(): Promise<string | undefined>;
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
