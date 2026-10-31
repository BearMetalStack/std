import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Animations, BMDripBase } from "@bearmetal/drip/ssr";
import type { Page, PageContext } from "../types.ts";
import { latestPages, sectionOf } from "../site.ts";
import { CLIENT, LOGO, STYLESHEET } from "./assets.ts";
import { DocsBar, LAYOUTS } from "./chrome.tsx";
import { type Measured, UNMEASURED } from "./measure.ts";

const THEME_BOOT =
	`try{var t=localStorage.getItem("gb-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

const PAGE_STYLE =
	`html{scroll-padding-top:6rem}body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);-webkit-font-smoothing:antialiased}`;

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
 * What every template renders into. In the `document` frame that is the whole `<html>`: drip's
 * theme and base styles, the gutenbearg stylesheet and client, and the stored light/dark choice
 * applied before first paint. Embedded, it is a `.gb-app` element for the app's own layout to
 * place, carrying the client and its data; the stylesheet goes into the app's `<head>`.
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
	if (ctx.frame && ctx.frame !== "document") {
		return (
			<div class={`gb-app gb-embedded frame-${ctx.frame} layout-${ctx.layout}`}>
				{ctx.inlineStylesheet && <link rel="stylesheet" href={STYLESHEET} />}
				{children}
				<ClientData ctx={ctx} written={written} />
				<script type="module" src={CLIENT}></script>
			</div>
		);
	}
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
				<style $raw>{PAGE_STYLE}</style>
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

/** The bar above the page for the context's frame: the layout's header, the docs bar, or nothing. */
export function TopBar(
	{ ctx, page, measured = UNMEASURED }: { ctx: PageContext; page?: Page; measured?: Measured },
): JSX.Element | null {
	if (ctx.frame === "article") return null;
	if (ctx.frame === "shell") return <DocsBar ctx={ctx} page={page} measured={measured} />;
	const Header = LAYOUTS[ctx.layout].header;
	return <Header ctx={ctx} page={page} measured={measured} />;
}

/**
 * Header, sidebar, main column and right rail around `children`, in the context's layout. The
 * `article` frame keeps only the main column.
 */
export function Shell(
	{ ctx, page, measured = UNMEASURED, children }: {
		ctx: PageContext;
		page?: Page;
		measured?: Measured;
		children?: JSX.Children;
	},
): JSX.Element {
	if (ctx.frame === "article") return <main class="gb-main">{children}</main>;
	const { side: Side, aside: Aside } = LAYOUTS[ctx.layout];
	const props = { ctx, page, measured };
	return (
		<>
			<TopBar {...props} />
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
