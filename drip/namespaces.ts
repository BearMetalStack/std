import type { DotBearmetalNamespaceManifest } from "@bearmetal/miscellanea/types";

export const namespaces: DotBearmetalNamespaceManifest = {
	primary: "drip",
	themes: ["drip", "themes"],
	stylesheets: ["drip", "stylesheets"],
} as const;
