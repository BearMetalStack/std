import { Router } from "@bearmetal/router";
import { layout } from "@views/layout.tsx";
import { home, post } from "@views/pages.tsx";

/**
 * The router is exported rather than served here, so both `main.ts` and
 * `diecast.ts` can reach it. Calling `Deno.serve` at module scope would leave
 * the app with nothing a build could import.
 */
export const router = new Router();

router.use(layout);
router.route("/").get(home);
router.route("/md/:file").get(post);
