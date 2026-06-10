// deno-lint-ignore-file no-explicit-any
import { dbModule } from "@bearmetal/db";
import Router from "@bearmetal/router";
import { authModule } from "./mod.ts";
import { devProxyModule } from "@bearmetal/devproxy";

const router = new Router();
const PORT = 3000;
router
	.use(async (_, next) => {
		try {
			return await next();
		} catch (e) {
			return new Response((e as any).message, { status: 500 });
		}
	})
	.use(devProxyModule("auth", PORT))
	.use(dbModule("postgres", { _type: "env", poolSize: 2, database: "authdev" }))
	.use(authModule());
await router.ready();
Deno.serve({ port: PORT, hostname: "0.0.0.0" }, router.handle.bind(router));
