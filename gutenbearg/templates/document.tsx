import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Animations, BMDripBase } from "@bearmetal/drip/ssr";
import type { PageContent, PageContext, ResolvedPage } from "../types.ts";
import { allPages } from "../site.ts";
import { CLIENT, LOGO, STYLESHEET } from "./assets.ts";
import { LAYOUTS } from "./chrome.tsx";
import { type Measured, UNMEASURED } from "./measure.ts";

const THEME_BOOT =
	`try{var t=localStorage.getItem("gb-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

/** What the client layer reads out of the page: the search index, glossary and route facts. */
function ClientData({ ctx, written }: { ctx: PageContext; written: boolean }): JSX.Element {
	const icons = Object.fromEntries(ctx.site.nav.map((s) => [s.id, s.icon]));
	const data = {
		base: ctx.base,
		route: ctx.route,
		written,
		pages: allPages(ctx.site).map((p) => ({
			route: p.route,
			title: p.title,
			section: p.section,
			package: p.package,
			icon: icons[p.section],
		})),
		packages: ctx.site.packages.map((p) => ({ id: p.id, name: p.name })),
		glossary: ctx.site.glossary,
	};
	return (
		<script type="application/json" id="gb-data" $raw>
			{JSON.stringify(data).replaceAll("<", "\\u003c")}
		</script>
	);
}

/**
 * The `<html>` every template renders into: drip's theme and base styles, the gutenbearg
 * stylesheet and client, and the stored light/dark choice applied before first paint.
 */
export function Document(
	{ ctx, title, description, written = false, children }: {
		ctx: PageContext;
		title: string;
		description?: string;
		/** Whether this route has content, so the client counts it as read. */
		written?: boolean;
		children?: JSX.Children;
	},
): JSX.Element {
	const full = title === ctx.site.name ? title : `${title} · ${ctx.site.name}`;
	return (
		<html lang="en" data-theme="dark">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{full}</title>
				{description && <meta name="description" content={description} />}
				<link rel="icon" href={LOGO} />
				<script $raw>{THEME_BOOT}</script>
				<BMDripBase theme={ctx.site.theme} />
				<Animations />
				<link rel="stylesheet" href={STYLESHEET} />
				<script type="module" src={CLIENT}></script>
			</head>
			<body>
				<div class={`gb-app layout-${ctx.layout}`}>{children}</div>
				<ClientData ctx={ctx} written={written} />
			</body>
		</html>
	);
}

/** Header, sidebar, main column and right rail around `children`, in the context's layout. */
export function Shell(
	{ ctx, page, content, measured = UNMEASURED, children }: {
		ctx: PageContext;
		page?: ResolvedPage;
		content?: PageContent;
		measured?: Measured;
		children?: JSX.Children;
	},
): JSX.Element {
	const { header: Header, side: Side, aside: Aside } = LAYOUTS[ctx.layout];
	const props = { ctx, page, content, measured };
	return (
		<>
			<Header {...props} />
			<div class="gb-shell">
				<aside class="gb-side">
					<Side {...props} />
				</aside>
				<main class="gb-main">{children}</main>
				<aside class="gb-aside">{content && <Aside {...props} />}</aside>
			</div>
		</>
	);
}
