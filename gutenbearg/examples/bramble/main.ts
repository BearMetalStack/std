import { Router } from "@bearmetal/router";
import { gutenbeargModule, type ShellLayout } from "@bearmetal/gutenbearg";
import { content } from "./content/mod.ts";

// `?layout=trail|shelves|den` and `?v=0.8` stick for the session, so the three shells and the
// old-version banners can be compared by clicking around rather than editing URLs.
const router = new Router();

router.use(async (ctx, next) => {
	const res = await next();
	for (const [query, cookie] of [["layout", "gb-layout"], ["v", "gb-version"]]) {
		const value = ctx.query[query];
		if (value) res.headers.append("Set-Cookie", `${cookie}=${value}; Path=/; SameSite=Lax`);
	}
	return res;
});

router.use(gutenbeargModule(content, {
	resolve: (ctx) => {
		const layout = (ctx.query.layout ?? ctx.cookies.get("gb-layout")) as ShellLayout | undefined;
		const version = ctx.query.v ?? ctx.cookies.get("gb-version");
		return { layout, version };
	},
}));

Deno.serve({ port: Number(Deno.env.get("BEARMETAL_GUTENBEARG_PORT") ?? 8000) }, router.handle);
