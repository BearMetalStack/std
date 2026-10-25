import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import type { Page, PageContext } from "../types.ts";
import { href, nearby, sectionOf } from "../site.ts";
import { Icon } from "../blocks/mod.tsx";
import { LOGO } from "./assets.ts";
import { Document, Shell } from "./document.tsx";

/**
 * Two pages in one. A route nobody wrote is a 404; a page marked `draft: true` is "still
 * hibernating", in place in the navigation. Both suggest the closest written pages.
 */
export function NotFoundTemplate(
	{ ctx, draft }: { ctx: PageContext; draft?: Page },
): JSX.Element {
	const near = nearby(ctx.content, ctx.route);
	const iconOf = (page: Page) => {
		const target = ctx.content.routes.get(page.route);
		return (target?.kind === "page" && sectionOf(target.scope, page.route)?.icon) || "book-open";
	};
	return (
		<Document ctx={ctx} title={draft ? draft.title : "Not found"}>
			<Shell ctx={ctx} page={draft}>
				<article class="gb-article gb-404">
					<div class="gb-404-art">
						<img src={LOGO} alt="" />
						<span class="gb-zz">
							<i>z</i>
							<i>z</i>
							<i>z</i>
						</span>
					</div>
					<p class="gb-404-code mono">{draft ? "draft" : "404"} · /{ctx.route}</p>
					<h1>{draft ? `“${draft.title}” is still hibernating` : "This page wandered off"}</h1>
					<p class="gb-lede">
						{draft
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
									<Icon name={iconOf(p)} />
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
