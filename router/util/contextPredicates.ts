import type { RouterContext } from "@/router.ts";

export function isModification(ctx: RouterContext): boolean {
	return ["PUT", "PATCH", "POST", "DELETE"].includes(ctx.request.method);
}
