/**
 * @module
 * Serves a documentation site from the BearMetal router.
 */

import {
	Html,
	NotFound,
	type RouterContext,
	Script,
	Style,
	TrustedModule,
} from "@bearmetal/router";
import { renderToString } from "@bearmetal/app/ssr";
import { fromFileUrl } from "@std/path";
import type { PageContext, ShellLayout, SiteContent } from "./types.ts";
import { allPages } from "./site.ts";
import { renderRoute } from "./templates/mod.ts";
import { ASSET_BASE } from "./templates/assets.ts";

/** What a request may decide about its own render. */
export interface RequestChoices {
	layout?: ShellLayout;
	version?: string;
}

/** Options for {@linkcode gutenbeargModule}. */
export interface GutenbeargOptions {
	/** Path the site is mounted under, e.g. `/docs`. Defaults to the root. */
	base?: string;
	/**
	 * Picks the layout and version for one request. Answers are held to the site's own lists:
	 * an unknown version falls back to the newest, an unknown layout to the site's.
	 */
	resolve?: (ctx: RouterContext) => RequestChoices | undefined;
	/** Answer unmatched paths under `base` with the 404 page. Defaults to `true`. */
	notFound?: boolean;
}

const LAYOUTS: ShellLayout[] = ["trail", "shelves", "den"];

const ASSETS: Record<string, [file: string, type: string]> = {
	"icons.svg": ["./assets/icons.svg", "image/svg+xml"],
	"logo.svg": ["./assets/logo.svg", "image/svg+xml"],
	"logo-animated.svg": ["./assets/logo-animated.svg", "image/svg+xml"],
};

class GutenbeargModule extends TrustedModule {
	#content: SiteContent;
	#base: string;
	#resolve: GutenbeargOptions["resolve"];
	#client: Promise<string> | null = null;
	#style: Promise<string> | null = null;

	constructor(content: SiteContent, options: GutenbeargOptions) {
		super("@bearmetal/gutenbearg");
		this.#content = content;
		this.#base = (options.base ?? "").replace(/\/$/, "");
		this.#resolve = options.resolve;
		this.init(options.notFound ?? true);
	}

	init(notFound: boolean) {
		this.route(`${ASSET_BASE}/gutenbearg.css`).get(async () => {
			this.#style ??= read("./styles/gutenbearg.css");
			return Style(await this.#style);
		});
		this.route(`${ASSET_BASE}/client.js`).get(async () => {
			this.#client ??= bundleClient();
			return Script(await this.#client);
		});
		this.route(`${ASSET_BASE}/:file`).get(async (ctx) => {
			const asset = ASSETS[ctx.params.file ?? ""];
			if (!asset) return NotFound();
			return new Response(await read(asset[0]), {
				headers: { "Content-Type": asset[1], "Cache-Control": "public, max-age=3600" },
			});
		});

		this.route(this.#base || "/").get((ctx) => this.page(ctx as RouterContext, ""));
		for (const page of allPages(this.#content.site)) {
			this.route(`${this.#base}/${page.route}`).get((ctx) =>
				this.page(ctx as RouterContext, page.route)
			);
		}
		if (notFound) {
			this.route(`${this.#base}/*`).get((ctx) => {
				const path = new URL(ctx.request.url).pathname;
				return this.page(ctx as RouterContext, path.slice(this.#base.length + 1));
			});
		}
	}

	async page(ctx: RouterContext, route: string): Promise<Response> {
		const site = this.#content.site;
		const choice = this.#resolve?.(ctx) ?? {};
		const pageCtx: PageContext = {
			site,
			route: route.replace(/\/$/, ""),
			base: this.#base,
			layout: choice.layout && LAYOUTS.includes(choice.layout)
				? choice.layout
				: site.layout ?? "trail",
			version: choice.version && site.versions.includes(choice.version)
				? choice.version
				: site.versions[0] ?? "",
		};
		const { status, view } = renderRoute(this.#content, pageCtx);
		const html = await renderToString(view, { url: ctx.request.url });
		return Html("<!DOCTYPE html>" + html, status);
	}
}

function read(path: string): Promise<string> {
	return fetch(new URL(path, import.meta.url)).then((r) => r.text());
}

async function bundleClient(): Promise<string> {
	const entry = new URL("./client/mod.ts", import.meta.url);
	const result = await Deno.bundle({
		entrypoints: [entry.protocol === "file:" ? fromFileUrl(entry) : entry.href],
		write: false,
		platform: "browser",
		minify: true,
	});
	const js = result.outputFiles?.[0];
	if (!js) {
		throw new Error(`gutenbearg: bundling the client failed: ${JSON.stringify(result.errors)}`);
	}
	return js.text();
}

/**
 * A documentation site as a router module: one route per page in the navigation, the home page at
 * `base`, a 404 for everything else under it, and the stylesheet, client script and icons at the
 * reserved `/@bearmetal/gutenbearg` path.
 *
 * Mount it after anything that should win over its catch-all.
 *
 * @example
 * ```ts
 * router.use(gutenbeargModule(content, {
 * 	resolve: (ctx) => ({ version: ctx.query.v }),
 * }));
 * ```
 */
export function gutenbeargModule(
	content: SiteContent,
	options: GutenbeargOptions = {},
): TrustedModule {
	return new GutenbeargModule(content, options);
}
