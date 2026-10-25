import { Router } from "@bearmetal/router";
import { gutenbeargModule, type ShellLayout } from "@bearmetal/gutenbearg";

// `?layout=trail|shelves|den` sticks for the session, so the three shells can be compared by
// clicking around rather than editing URLs.
const router = new Router();

router.use(async (ctx, next) => {
	const res = await next();
	if (ctx.query.layout) {
		res.headers.append("Set-Cookie", `gb-layout=${ctx.query.layout}; Path=/; SameSite=Lax`);
	}
	return res;
});

router.use(
	await gutenbeargModule({
		dir: new URL("./.bearmetal/gutenbearg", import.meta.url).pathname,
		watch: Deno.args.includes("--watch"),
		resolve: (ctx) => ({
			layout: (ctx.query.layout ?? ctx.cookies.get("gb-layout")) as ShellLayout | undefined,
		}),
	}),
);

Deno.serve({ port: Number(Deno.env.get("BEARMETAL_GUTENBEARG_PORT") ?? 8000) }, router.handle);
