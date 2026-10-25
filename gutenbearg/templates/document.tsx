import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Animations, BMDripBase } from "@bearmetal/drip/ssr";
import type { Page, PageContext } from "../types.ts";
import { latestPages, sectionOf } from "../site.ts";
import { CLIENT, LOGO, STYLESHEET } from "./assets.ts";
import { LAYOUTS } from "./chrome.tsx";
import { type Measured, UNMEASURED } from "./measure.ts";

const THEME_BOOT =
	`try{var t=localStorage.getItem("gb-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

/** What the client layer reads out of the page: the search index, glossary and route facts. */
function ClientData({ ctx, written }: { ctx: PageContext; written: boolean }): JSX.Element {
	const data = {
		base: ctx.base,
		route: ctx.route,
		written,
		pages: latestPages(ctx.content).map(({ page, scope }) => ({
			route: page.route,
			title: page.title,
			section: sectionOf(scope, page.route)?.title ?? "",
			package: scope.kind === "package" ? scope.package.name : undefined,
			icon: sectionOf(scope, page.route)?.icon ?? "book-open",
		})),
		glossary: ctx.content.glossary,
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
	const name = ctx.content.site.name;
	const full = title === name ? title : `${title} · ${name}`;
	return (
		<html lang="en" data-theme="dark">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>{full}</title>
				{description && <meta name="description" content={description} />}
				<link rel="icon" href={LOGO} />
				<script $raw>{THEME_BOOT}</script>
				<BMDripBase theme={ctx.content.site.theme} />
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
	{ ctx, page, measured = UNMEASURED, children }: {
		ctx: PageContext;
		page?: Page;
		measured?: Measured;
		children?: JSX.Children;
	},
): JSX.Element {
	const { header: Header, side: Side, aside: Aside } = LAYOUTS[ctx.layout];
	const props = { ctx, page, measured };
	return (
		<>
			<Header {...props} />
			<div class="gb-shell">
				<aside class="gb-side">
					<Side {...props} />
				</aside>
				<main class="gb-main">{children}</main>
				<aside class="gb-aside">{page && <Aside {...props} />}</aside>
			</div>
		</>
	);
}
