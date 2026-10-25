import type { PageContext, ResolvedPage, SiteConfig, Status, Tone } from "./types.ts";

/** Route of a page within its section: `section` or `section/slug`. */
export function routeOf(section: string, slug: string): string {
	return slug ? `${section}/${slug}` : section;
}

/** Every page in navigation order, with its section and route filled in. */
export function allPages(site: SiteConfig): ResolvedPage[] {
	return site.nav.flatMap((s) =>
		s.pages.map((p) => ({ ...p, section: s.id, route: routeOf(s.id, p.slug) }))
	);
}

/** The navigation entry for `route`, if there is one. */
export function findPage(site: SiteConfig, route: string): ResolvedPage | undefined {
	return allPages(site).find((p) => p.route === route);
}

/** An absolute link to `route` under the context's base. */
export function href(ctx: Pick<PageContext, "base">, route: string): string {
	return `${ctx.base}/${route}`;
}

/** The pages either side of `route` in navigation order. */
export function prevNext(
	site: SiteConfig,
	route: string,
): { prev?: ResolvedPage; next?: ResolvedPage } {
	const pages = allPages(site);
	const i = pages.findIndex((p) => p.route === route);
	if (i < 0) return {};
	return { prev: pages[i - 1], next: pages[i + 1] };
}

/**
 * Up to `count` written pages that look like `route`, for a 404. Scores by how many of the
 * route's words appear in a candidate, with a nudge toward the same section.
 */
export function nearby(
	site: SiteConfig,
	route: string,
	written: (route: string) => boolean,
	count = 3,
): ResolvedPage[] {
	const words = route.toLowerCase().split(/[/-]/).filter(Boolean);
	const section = route.split("/")[0];
	return allPages(site)
		.filter((p) => p.route !== route && written(p.route))
		.map((p) => {
			const hay = (p.route + p.title).toLowerCase();
			const hits = words.filter((w) => hay.includes(w.slice(0, 4))).length;
			return { p, score: hits + (p.section === section ? 0.5 : 0) };
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, count)
		.map(({ p }) => p);
}

/** The badge tone a status reads as. */
export function toneOf(status?: Status): Tone {
	switch (status) {
		case "stable":
			return "success";
		case "beta":
			return "info";
		case "alpha":
			return "warn";
		case "deprecated":
			return "danger";
		default:
			return "neutral";
	}
}

/** Reading time for `text` at 200 words a minute, never under one. */
export function readingMinutes(text: string): number {
	return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));
}

/** A heading's anchor id. */
export function slugify(text: string): string {
	return text.toLowerCase().replace(/[`*()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(
		/^-|-$/g,
		"",
	);
}
