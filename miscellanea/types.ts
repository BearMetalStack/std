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
export type DotBearmetalNamespace = string | string[];
export type DotBearmetalNamespaceManifest = {
	primary: string;
	[key: string]: string[] | string;
};
