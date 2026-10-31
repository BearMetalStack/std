import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { PageContext } from "../types.ts";
import { href, packageRoute, releaseOf, toneOf } from "../site.ts";
import { Badge } from "../blocks/mod.tsx";
import { LOGO_ANIMATED } from "./assets.ts";
import { Document, TopBar } from "./document.tsx";

/** The landing page: hero, the body's blocks, then a tile per package. No sidebar or rail. */
export function HomeTemplate({ ctx }: { ctx: PageContext }): JSX.Element {
	const { frontmatter: fm, body } = ctx.content.home;
	return (
		<Document ctx={ctx} title={ctx.content.site.name} description={fm.tagline}>
			<TopBar ctx={ctx} />
			<main class="gb-home">
				<section class="gb-hero">
					<div class="gb-hero-copy">
						{fm.badge && <Badge tone="info">{fm.badge}</Badge>}
						<h1>
							<span class="gb-hero-name gradient ember animate">{fm.name}</span>
							{fm.text && <span>{fm.text}</span>}
						</h1>
						{fm.tagline && <p>{fm.tagline}</p>}
						{(fm.primary || fm.secondary) && (
							<div class="gb-hero-cta">
								{fm.primary && (
									<a class="gb-cta primary sq" href={fm.primary.href}>{fm.primary.label}</a>
								)}
								{fm.secondary && (
									<a class="gb-cta secondary sq" href={fm.secondary.href}>{fm.secondary.label}</a>
								)}
							</div>
						)}
					</div>
					<div class="gb-hero-art">
						<div class="gb-halo gradient nightshade animate"></div>
						<img src={LOGO_ANIMATED} alt="" />
					</div>
				</section>
				{body && <section class="gb-home-body gb-prose">{body()}</section>}
				<section class="gb-home-pkgs">
					{ctx.content.packages.map((p) => {
						const route = packageRoute(p);
						if (!route) return null;
						return (
							<a class="sq" href={href(ctx, route)}>
								<code>{p.name}</code>
								{releaseOf(p) && <span class="mono">{releaseOf(p)}</span>}
								{p.status && <Badge tone={toneOf(p.status)}>{p.status}</Badge>}
							</a>
						);
					})}
				</section>
			</main>
		</Document>
	);
}
