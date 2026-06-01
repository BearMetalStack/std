import type { RouterContext } from "@/router.ts";

export function isModification(ctx: RouterContext) {
	return ["PUT", "PATCH", "POST", "DELETE"].includes(ctx.request.method);
}
