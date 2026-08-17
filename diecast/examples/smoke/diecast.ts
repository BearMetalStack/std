import { defineSite, runDiecast } from "@bearmetal/diecast";
import { router } from "./app.ts";
import manifest from "./diecast.manifest.ts";

export const site = defineSite({ router, manifest, outDir: "dist" });

if (import.meta.main) await runDiecast(site);
