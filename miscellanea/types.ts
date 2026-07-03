import type { Fn } from "@fn";

export type TemplateArgs = [template: TemplateStringsArray, ...substitutions: unknown[]];
export type TagFn = Fn<TemplateArgs, string>;

export type DotBearmetalFile = {
	read(): Promise<string>;
	write(content: string): Promise<void>;
};
export type DotBearmetalNamespace = string | string[];
export type DotBearmetalNamespaceManifest = {
	primary: string;
	[key: string]: string[] | string;
};
