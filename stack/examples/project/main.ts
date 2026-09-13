import { Router } from "@bearmetal/router";
import { appModule } from "@bearmetal/app/serve";
// @bearmetal-partial main-ts-imports
import { page } from "@views/layouts/page.tsx";
import { home } from "@views/home.tsx";
import { userProfile } from "@views/users/id.tsx";

const router = new Router();

router
	.use(async (_, next) => {
		try {
			return await next();
		} catch (e) {
			console.error(e);
			return new Response("Internal Server Error", { status: 500 });
		}
	})
	.use(appModule())
	// @bearmetal-partial main-ts-middleware
	.use(page);

router.route("/")
	.get(home);

router.route("/users/:id")
	.get(userProfile);

router.serveDirectory("public", "/", { favicon: "bmicon.svg" });

Deno.serve(router.handle);
