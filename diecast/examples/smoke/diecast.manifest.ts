import { defineManifest } from "@bearmetal/diecast/manifest";
import { slugs } from "@views/pages.tsx";

export default defineManifest({
	"/md/:file": {
		permutations: () => slugs.map((file) => ({ params: { file } })),
	},
});
