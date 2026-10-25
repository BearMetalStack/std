import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { PageContext, ResolvedPage } from "../types.ts";
import { href, nearby } from "../site.ts";
import { Icon } from "../blocks/mod.tsx";
import { LOGO } from "./assets.ts";
import { Document, Shell } from "./document.tsx";

/**
 * Two pages in one. A route nobody planned is a 404; a route that is in the navigation but not
 * written yet is a draft that is "still hibernating". Both suggest the closest written pages.
 */
export function NotFoundTemplate(
	{ ctx, planned, written }: {
		ctx: PageContext;
		/** The navigation entry, when the route is planned but unwritten. */
		planned?: ResolvedPage;
		/** Whether a route has content, to pick suggestions from. */
		written: (route: string) => boolean;
	},
): JSX.Element {
	const near = nearby(ctx.site, ctx.route, written);
	const icon = (section: string) => ctx.site.nav.find((s) => s.id === section)?.icon ?? "book-open";
	return (
		<Document ctx={ctx} title={planned ? planned.title : "Not found"}>
			<Shell ctx={ctx} page={planned}>
				<article class="gb-article gb-404">
					<div class="gb-404-art">
						<img src={LOGO} alt="" />
						<span class="gb-zz">
							<i>z</i>
							<i>z</i>
							<i>z</i>
						</span>
					</div>
					<p class="gb-404-code mono">{planned ? "draft" : "404"} · /{ctx.route}</p>
					<h1>{planned ? `“${planned.title}” is still hibernating` : "This page wandered off"}</h1>
					<p class="gb-lede">
						{planned
							? "It’s on the map but hasn’t been written yet. These cover nearby ground:"
							: "We checked under every rock. It may have moved, or the link was mistyped. Try one of these:"}
					</p>
					<div class="gb-tracks" aria-hidden="true">
						{Array.from(
							{ length: 7 },
							(_, i) => (
								<span class={i % 2 ? "r" : "l"} style={`animation-delay:${i * 0.35}s`}>
									<Icon name="paw-print-fill" />
								</span>
							),
						)}
					</div>
					<ul class="gb-near">
						{near.map((p) => (
							<li>
								<a href={href(ctx, p.route)} class="sq">
									<Icon name={icon(p.section)} />
									<b>{p.title}</b>
									<small>{p.route}</small>
									<Icon name="arrow-right" />
								</a>
							</li>
						))}
					</ul>
					<a class="gb-cta secondary sq" href={href(ctx, "")}>
						<Icon name="house" />
						Back to the den
					</a>
				</article>
			</Shell>
		</Document>
	);
}
