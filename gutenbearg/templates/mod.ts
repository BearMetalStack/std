/**
 * @module
 * Page templates. Each renders a whole document for one kind of page; {@linkcode renderRoute}
 * picks the right one for a route.
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { PageContext, SiteContent } from "../types.ts";
import { findPage } from "../site.ts";
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
export { measure, outline } from "./measure.ts";
export type { Measured, PageHeading } from "./measure.ts";
export { ASSET_BASE, CLIENT, LOGO, LOGO_ANIMATED, STYLESHEET } from "./assets.ts";

/** The rendered page for `ctx.route`, and the status it should be served with. */
export function renderRoute(
	content: SiteContent,
	ctx: PageContext,
): { status: number; view: () => JSX.Element } {
	if (ctx.route === "") {
		return { status: 200, view: () => HomeTemplate({ ctx, content: content.home }) };
	}
	const page = findPage(content.site, ctx.route);
	const written = content.pages[ctx.route];
	if (written?.kind === "doc") {
		return { status: 200, view: () => DocTemplate({ ctx, page, content: written }) };
	}
	if (written?.kind === "changelog") {
		return { status: 200, view: () => ChangelogTemplate({ ctx, page, content: written }) };
	}
	const isWritten = (route: string) => route in content.pages;
	return {
		status: 404,
		view: () => NotFoundTemplate({ ctx, planned: page, written: isWritten }),
	};
}
