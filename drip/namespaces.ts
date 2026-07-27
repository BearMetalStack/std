import type { DotBearmetalNamespaceManifest } from "@bearmetal/miscellanea/types";

export const namespaces: DotBearmetalNamespaceManifest & {
	themes: string[];
	stylesheets: string[];
} = {
	primary: "drip",
	themes: ["drip", "themes"],
	stylesheets: ["drip", "stylesheets"],
} as const;

export type Namespace = keyof typeof namespaces;
