import { Router } from "@bearmetal/router";
import { createStack } from "@bearmetal/stack";
// @bearmetal-partial main-ts-imports
import { page } from "@views/layouts/page.tsx";
import { home } from "@views/home.tsx";

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
	.use(createStack())
	// @bearmetal-partial main-ts-middleware
	.use(page);

router.route("/")
	.get(home);

router.serveDirectory("public", "/", { favicon: "bmicon.svg" });

Deno.serve(router.handle);
