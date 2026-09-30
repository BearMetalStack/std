/**
 * @module
 * A `sitemap.xml` built from the pages a build wrote.
 *
 * The sitemap lists what is on disk, not what the router declares: every URL
 * in it is one a static host will answer, at the path the file actually landed.
 */

import { joinPath } from "@bearmetal/miscellanea";
import { ensureDirOf } from "@bearmetal/miscellanea/fs";
import { hrefFor, isHtml } from "./write.ts";
import type { GeneratedPage, SitemapOptions } from "./types.ts";

const DEFAULT_FILE = "sitemap.xml";

function escapeXml(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/** One `<url>` in a sitemap. */
export type SitemapEntry = { loc: string; lastmod?: string };

/**
 * A `<lastmod>` value: a `Date` in W3C datetime form, a string as given.
 * An invalid `Date` or an empty string yields nothing rather than a bad value.
 */
function formatLastmod(value: Date | string | undefined): string | undefined {
	if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value.toISOString();
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

/**
 * The entries a sitemap lists for a set of written pages, sorted by URL.
 *
 * Only real HTML pages are listed - assets and redirect shims are left out.
 * Each URL is where the page's file is served from (`about/index.html` is
 * `/about/`), resolved against `origin`, which may carry a base path.
 *
 * `lastmod` comes from the options' callback, falling back to the page's own
 * from the manifest. A page with neither gets none.
 */
export async function sitemapEntries(
	pages: GeneratedPage[],
	options: SitemapOptions,
): Promise<SitemapEntry[]> {
	const base = options.origin.endsWith("/") ? options.origin : `${options.origin}/`;
	const entries = new Map<string, SitemapEntry>();
	for (const page of pages) {
		if (!isHtml(page.contentType) || page.status < 200 || page.status >= 300) continue;
		const href = hrefFor(page.file);
		if (options.exclude?.(href)) continue;
		const loc = new URL(href.slice(1), base).href;
		if (entries.has(loc)) continue;
		const lastmod = formatLastmod((await options.lastmod?.(href, page)) ?? page.lastmod);
		entries.set(loc, lastmod ? { loc, lastmod } : { loc });
	}
	return [...entries.values()].sort((a, b) => a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0);
}

/** Render a `sitemap.xml` document listing the given pages. */
export async function renderSitemap(
	pages: GeneratedPage[],
	options: SitemapOptions,
): Promise<string> {
	const entries = (await sitemapEntries(pages, options))
		.map(({ loc, lastmod }) =>
			`\t<url>\n\t\t<loc>${escapeXml(loc)}</loc>\n` +
			(lastmod ? `\t\t<lastmod>${escapeXml(lastmod)}</lastmod>\n` : "") +
			`\t</url>\n`
		)
		.join("");
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}</urlset>
`;
}

/**
 * Write a sitemap for the given pages into `outDir`.
 *
 * @returns the path written, relative to `outDir`.
 */
export async function writeSitemap(
	outDir: string,
	pages: GeneratedPage[],
	options: SitemapOptions,
): Promise<string> {
	const file = (options.file ?? DEFAULT_FILE).replace(/^\/+/, "");
	const target = joinPath(outDir, file);
	await ensureDirOf(target);
	await Deno.writeTextFile(target, await renderSitemap(pages, options));
	return file;
}
