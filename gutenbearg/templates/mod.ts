/**
 * @module
 * Page templates. Each renders a whole document for one kind of page; {@linkcode renderRoute}
 * picks the right one for a route.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { PageContext } from "../types.ts";
import { ChangelogTemplate } from "./changelog.tsx";
import { DocTemplate } from "./doc.tsx";
import { HomeTemplate } from "./home.tsx";
import { NotFoundTemplate } from "./not_found.tsx";

export { ChangelogTemplate } from "./changelog.tsx";
export { DocTemplate, PageHeader, PrevNext, VersionBanner } from "./doc.tsx";
export { HomeTemplate } from "./home.tsx";
export { NotFoundTemplate } from "./not_found.tsx";
export { Document, Shell } from "./document.tsx";
export { LAYOUTS } from "./chrome.tsx";
export type { ChromeProps } from "./chrome.tsx";
export { measure, outline, UNMEASURED } from "./measure.ts";
export type { Measured, PageHeading } from "./measure.ts";
export { ASSET_BASE, CLIENT, LOGO, LOGO_ANIMATED, STYLESHEET } from "./assets.ts";

/**
 * The page for `ctx.route`, and the status to serve it with. `ctx.scope` is filled in from the
 * route table, so callers only need the route.
 */
export function renderRoute(ctx: PageContext): { status: number; view: () => JSX.Element } {
	const target = ctx.content.routes.get(ctx.route);
	if (target?.kind === "home") return { status: 200, view: () => HomeTemplate({ ctx }) };
	if (target?.kind === "changelog") {
		const scoped = target.package?.versions[0] &&
			{ kind: "package" as const, package: target.package, version: target.package.versions[0] };
		const c = { ...ctx, scope: scoped || undefined };
		return { status: 200, view: () => ChangelogTemplate({ ctx: c, package: target.package }) };
	}
	if (target?.kind === "page") {
		const c = { ...ctx, scope: target.scope };
		if (target.page.frontmatter.draft) {
			return { status: 200, view: () => NotFoundTemplate({ ctx: c, draft: target.page }) };
		}
		return { status: 200, view: () => DocTemplate({ ctx: c, page: target.page }) };
	}
	return { status: 404, view: () => NotFoundTemplate({ ctx }) };
}
