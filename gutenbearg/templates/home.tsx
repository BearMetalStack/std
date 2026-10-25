import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { HomeContent, PageContext } from "../types.ts";
import { allPages, href, toneOf } from "../site.ts";
import { Badge } from "../blocks/mod.tsx";
import { LOGO_ANIMATED } from "./assets.ts";
import { Document } from "./document.tsx";
import { LAYOUTS } from "./chrome.tsx";

/** The landing page: hero, the body's blocks, then a tile per package. No sidebar or rail. */
export function HomeTemplate(
	{ ctx, content }: { ctx: PageContext; content: HomeContent },
): JSX.Element {
	const fm = content.frontmatter;
	const Header = LAYOUTS[ctx.layout].header;
	const pages = allPages(ctx.site);
	const tileHref = (id: string, own?: string) =>
		own ?? href(ctx, pages.find((p) => p.package === id)?.route ?? "");
	return (
		<Document ctx={ctx} title={ctx.site.name} description={fm.tagline}>
			<Header ctx={ctx} measured={{ headings: [], minutes: 0, terms: [] }} />
			<main class="gb-home">
				<section class="gb-hero">
					<div class="gb-hero-copy">
						{fm.badge && <Badge tone="info">{fm.badge}</Badge>}
						<h1>
							<span class="gb-hero-name gradient ember animate">{fm.name}</span>
							<span>{fm.text}</span>
						</h1>
						<p>{fm.tagline}</p>
						<div class="gb-hero-cta">
							<a class="gb-cta primary sq" href={fm.primary.href}>{fm.primary.label}</a>
							{fm.secondary && (
								<a class="gb-cta secondary sq" href={fm.secondary.href}>{fm.secondary.label}</a>
							)}
						</div>
					</div>
					<div class="gb-hero-art">
						<div class="gb-halo gradient nightshade animate"></div>
						<img src={LOGO_ANIMATED} alt="" />
					</div>
				</section>
				{content.body && <section class="gb-home-body gb-prose">{content.body()}</section>}
				<section class="gb-home-pkgs">
					{ctx.site.packages.map((p) => (
						<a class="sq" href={tileHref(p.id, p.href)}>
							<code>{p.name}</code>
							<span class="mono">{p.version}</span>
							<Badge tone={toneOf(p.status)}>{p.status}</Badge>
						</a>
					))}
				</section>
			</main>
		</Document>
	);
}
