import { Router } from "@bearmetal/router";
import { appModule } from "@bearmetal/app/serve";
import { appDevServer } from "@bearmetal/dev-server";
import { page } from "@views/layouts/page.tsx";
import { home } from "@views/home.tsx";

const router = new Router();

router
	.use(appModule({ devServer: appDevServer }))
	.use(page);

router.route("/").get(home);

Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8123) }, router.handle);
