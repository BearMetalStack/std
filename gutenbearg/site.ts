import type {
	PackageInfo,
	PackageVersion,
	Page,
	PageContext,
	Scope,
	Section,
	SiteContent,
	Status,
	Tone,
} from "./types.ts";

/** An absolute link to `route` under the context's base. */
export function href(ctx: Pick<PageContext, "base">, route: string): string {
	return `${ctx.base}/${route}`;
}

/** The sections a scope's sidebar lists. */
export function sectionsOf(scope: Scope): Section[] {
	return scope.kind === "guides" ? scope.sections : scope.version.sections;
}

/** Every page in a scope, in reading order. */
export function pagesOf(scope: Scope): Page[] {
	return sectionsOf(scope).flatMap((s) => s.pages);
}

/** The first page of a section, scope or package version, or `undefined` when it has none. */
export function firstPage(of: Section | PackageVersion | Section[]): Page | undefined {
	const sections = Array.isArray(of) ? of : "pages" in of ? [of] : of.sections;
	return sections.find((s) => s.pages.length)?.pages[0];
}

/** Where a package's link goes: its latest version's first page. */
export function packageRoute(pkg: PackageInfo): string | undefined {
	return pkg.versions[0] && firstPage(pkg.versions[0])?.route;
}

/** The pages either side of `route` in its scope. */
export function prevNext(scope: Scope, route: string): { prev?: Page; next?: Page } {
	const pages = pagesOf(scope);
	const i = pages.findIndex((p) => p.route === route);
	if (i < 0) return {};
	return { prev: pages[i - 1], next: pages[i + 1] };
}

/** The section of `scope` holding `route`. */
export function sectionOf(scope: Scope, route: string): Section | undefined {
	return sectionsOf(scope).find((s) => s.pages.some((p) => p.route === route));
}

/** Every page of the latest documentation: guides and each package's newest version. */
export function latestPages(content: SiteContent): { page: Page; scope: Scope }[] {
	const out: { page: Page; scope: Scope }[] = [];
	const guides: Scope = { kind: "guides", sections: content.guides };
	for (const page of pagesOf(guides)) out.push({ page, scope: guides });
	for (const pkg of content.packages) {
		const version = pkg.versions[0];
		if (!version) continue;
		const scope: Scope = { kind: "package", package: pkg, version };
		for (const page of pagesOf(scope)) out.push({ page, scope });
	}
	return out;
}

/**
 * Up to `count` latest pages that look like `route`, for a 404. Scores by how many of the route's
 * words appear in a candidate.
 */
export function nearby(content: SiteContent, route: string, count = 3): Page[] {
	const words = route.toLowerCase().split(/[/-]/).filter(Boolean);
	return latestPages(content)
		.filter(({ page }) => page.route !== route && !page.frontmatter.draft)
		.map(({ page }) => {
			const hay = (page.route + page.title).toLowerCase();
			return { page, score: words.filter((w) => hay.includes(w.slice(0, 4))).length };
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, count)
		.map(({ page }) => page);
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

/** The version to show for a package: its released version when linked, else its newest docs. */
export function releaseOf(pkg: PackageInfo): string | undefined {
	return pkg.source?.version ?? (pkg.versions[0]?.version || undefined);
}
