import { registerPage } from "@bearmetal/app";

// The fallback every route resolves to when it has no more specific @pages
// file of its own - nothing to bootstrap for the home page yet.
registerPage("main", () => {});
