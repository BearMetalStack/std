/**
 * @module
 * Page templates. Each renders a whole document for one kind of page; {@linkcode renderRoute}
 * picks the right one for a route.
 */

import type { PageContext, RenderedRoute } from "../types.ts";
import { ChangelogTemplate, changelogTitle } from "./changelog.tsx";
import { DocTemplate } from "./doc.tsx";
import { HomeTemplate } from "./home.tsx";
import { NotFoundTemplate } from "./not_found.tsx";

export { ChangelogTemplate, changelogTitle } from "./changelog.tsx";
export { DocTemplate, PageHeader, PrevNext, VersionBanner } from "./doc.tsx";
export { HomeTemplate } from "./home.tsx";
export { NotFoundTemplate } from "./not_found.tsx";
export { Document, Shell, TopBar } from "./document.tsx";
export { DocsBar, LAYOUTS } from "./chrome.tsx";
export type { ChromeProps } from "./chrome.tsx";
export { measure, outline, UNMEASURED } from "./measure.ts";
export type { Measured, PageHeading } from "./measure.ts";
export { ASSET_BASE, CLIENT, LOGO, LOGO_ANIMATED, STYLESHEET } from "./assets.ts";

/**
 * The page for `ctx.route`, its title, and the status to serve it with. `ctx.scope` is filled in
 * from the route table, so callers only need the route; `ctx.frame` decides how much chrome the
 * view brings.
 */
export function renderRoute(ctx: PageContext): RenderedRoute {
	const target = ctx.content.routes.get(ctx.route);
	if (target?.kind === "home") {
		return {
			status: 200,
			title: ctx.content.site.name,
			description: ctx.content.home.frontmatter.tagline,
			view: () => HomeTemplate({ ctx }),
		};
	}
	if (target?.kind === "changelog") {
		const scoped = target.package?.versions[0] &&
			{ kind: "package" as const, package: target.package, version: target.package.versions[0] };
		const c = { ...ctx, scope: scoped || undefined };
		return {
			status: 200,
			...changelogTitle(target.package),
			view: () => ChangelogTemplate({ ctx: c, package: target.package }),
		};
	}
	if (target?.kind === "page") {
		const c = { ...ctx, scope: target.scope };
		const { page } = target;
		const meta = { title: page.title, description: page.frontmatter.description };
		if (page.frontmatter.draft) {
			return { status: 200, ...meta, view: () => NotFoundTemplate({ ctx: c, draft: page }) };
		}
		return { status: 200, ...meta, view: () => DocTemplate({ ctx: c, page }) };
	}
	return { status: 404, title: "Not found", view: () => NotFoundTemplate({ ctx }) };
}
