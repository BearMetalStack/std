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
import { contributeRouteHead, type LayoutState, Page, renderToString } from "@bearmetal/app/ssr";
import { fromFileUrl } from "@std/path";
import type {
	Diagnostic,
	FrameKind,
	PageContext,
	RenderedRoute,
	ShellLayout,
	SiteContent,
} from "./types.ts";
import { renderRoute } from "./templates/mod.ts";
import { ASSET_BASE, STYLESHEET } from "./templates/assets.ts";
import { ContentLoader, DEFAULT_DIR, type LoadOptions } from "./content/load.ts";
import { buildSprite } from "./icons.ts";

/** What a request may decide about its own render. */
export interface RequestChoices {
	layout?: ShellLayout;
	frame?: FrameKind;
}

/** Options for {@linkcode gutenbeargModule}. */
export interface GutenbeargOptions extends LoadOptions {
	/** Content directory. Defaults to `.bearmetal/gutenbearg`. */
	dir?: string;
	/**
	 * How much chrome a page brings. `document` (the default) serves whole HTML documents;
	 * `shell` and `article` render inside the app's own `Layout()` from `@bearmetal/app/ssr`.
	 */
	frame?: FrameKind;
	/**
	 * Register the site's pages on the router. With `false` the module serves only its assets, and
	 * the app renders pages itself through {@linkcode GutenbeargModule.render}.
	 */
	routes?: boolean;
	/** Picks the layout and frame for one request; an unknown answer falls back to the default. */
	resolve?: (ctx: RouterContext) => RequestChoices | undefined;
	/** Reload content when files under `dir` change, for development. */
	watch?: boolean;
	/** Where diagnostics go. Defaults to the console; pass `false` to keep quiet. */
	report?: ((diagnostics: Diagnostic[]) => void) | false;
}

const LAYOUTS: ShellLayout[] = ["trail", "shelves", "den"];
const FRAMES: FrameKind[] = ["document", "shell", "article"];

/** Options for {@linkcode GutenbeargModule.render}. */
export interface RenderOptions {
	frame?: FrameKind;
	layout?: ShellLayout;
	/**
	 * Put the stylesheet `<link>` in the view itself. On by default for embedded frames, because a
	 * view rendered by the app has no other way into `<head>`.
	 */
	inlineStylesheet?: boolean;
}

/** Every file served under `/@bearmetal/gutenbearg`, for a static build to copy. */
export const ASSET_FILES: readonly string[] = [
	"gutenbearg.css",
	"client.js",
	"icons.svg",
	"logo.svg",
	"logo-animated.svg",
];

const ASSETS: Record<string, [file: string, type: string]> = {
	"logo.svg": ["./assets/logo.svg", "image/svg+xml"],
	"logo-animated.svg": ["./assets/logo-animated.svg", "image/svg+xml"],
};

/** Prints diagnostics grouped by file. */
export function reportDiagnostics(diagnostics: Diagnostic[]): void {
	if (!diagnostics.length) return;
	const byFile = Map.groupBy(diagnostics, (d) => d.file);
	console.warn(`gutenbearg: ${diagnostics.length} content problem(s)`);
	for (const [file, list] of byFile) {
		console.warn(`  ${file}`);
		for (const d of list) console.warn(`    ${d.level === "error" ? "✖" : "⚠"} ${d.message}`);
	}
}

/** The router module {@linkcode gutenbeargModule} builds. `content` is the site as currently loaded. */
export class GutenbeargModule extends TrustedModule {
	#content: SiteContent;
	#loader: ContentLoader;
	#base: string;
	#resolve: GutenbeargOptions["resolve"];
	#frame: FrameKind;
	#routes: boolean;
	#warned = new Set<string>();
	#disposeHead: (() => void) | undefined;
	#embeds: boolean;
	#report: (diagnostics: Diagnostic[]) => void;
	#client: Promise<string> | null = null;
	#style: Promise<string> | null = null;
	#sprite: Promise<string> | null = null;

	constructor(loader: ContentLoader, content: SiteContent, options: GutenbeargOptions) {
		super("@bearmetal/gutenbearg");
		this.#loader = loader;
		this.#content = content;
		this.#base = (options.base ?? "").replace(/\/$/, "");
		this.#resolve = options.resolve;
		this.#frame = options.frame ?? "document";
		this.#routes = options.routes ?? true;
		this.#embeds = this.#frame !== "document" || !!options.resolve;
		this.#report = options.report === false ? () => {} : options.report ?? reportDiagnostics;
		this.#report(content.diagnostics);
		this.init();
		if (options.watch) this.#watch();
	}

	get content(): SiteContent {
		return this.#content;
	}

	/**
	 * Renders `route` (no leading slash, relative to `base`) for an app to place in its own page.
	 * Embedded frames carry the stylesheet link with them unless told otherwise.
	 *
	 * @example
	 * ```tsx
	 * const docs = await gutenbeargModule({ base: "/help", routes: false });
	 * router.use(docs);
	 * router.route("/help/*").get(Page((ctx) => {
	 *   const route = new URL(ctx.request.url).pathname.slice("/help/".length);
	 *   return <HelpFrame>{docs.render(route, { frame: "article" }).view()}</HelpFrame>;
	 * }));
	 * ```
	 */
	render(route: string, options: RenderOptions = {}): RenderedRoute {
		const frame = options.frame ?? (this.#frame === "document" ? "article" : this.#frame);
		return renderRoute(
			this.#context(route, options.layout, frame, options.inlineStylesheet ?? frame !== "document"),
		);
	}

	/** Stops contributing the stylesheet to the app's `<head>`. */
	[Symbol.dispose](): void {
		this.#disposeHead?.();
		this.#disposeHead = undefined;
	}

	#context(
		route: string,
		layout: ShellLayout | undefined,
		frame: FrameKind | undefined,
		inlineStylesheet = false,
	): PageContext {
		const content = this.#content;
		const embedded = frame && frame !== "document";
		if (embedded && content.site.theme) {
			this.#warnOnce(
				"theme",
				"gutenbearg: site.theme is ignored inside an app's layout; the app's drip theme applies.",
			);
		}
		return {
			content,
			route,
			base: this.#base,
			layout: layout && LAYOUTS.includes(layout) ? layout : content.site.layout ?? "trail",
			frame: frame && FRAMES.includes(frame) ? frame : "document",
			inlineStylesheet,
		};
	}

	#warnOnce(key: string, message: string) {
		if (this.#warned.has(key)) return;
		this.#warned.add(key);
		console.warn(message);
	}

	init() {
		this.route(`${ASSET_BASE}/gutenbearg.css`).get(async () => {
			this.#style ??= read("./styles/gutenbearg.css");
			return Style(await this.#style);
		});
		this.route(`${ASSET_BASE}/client.js`).get(async () => {
			this.#client ??= bundleClient();
			return Script(await this.#client);
		});
		this.route(`${ASSET_BASE}/icons.svg`).get(async () => {
			this.#sprite ??= buildSprite(this.#content.icons).then(({ sheet, missing }) => {
				if (missing.length) {
					this.#report(missing.map((name) => ({
						level: "warn" as const,
						file: "(icons)",
						message: `no Phosphor icon named "${name}"`,
					})));
				}
				return sheet;
			});
			return new Response(await this.#sprite, {
				headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" },
			});
		});
		this.route(`${ASSET_BASE}/:file`).get(async (ctx) => {
			const asset = ASSETS[ctx.params.file ?? ""];
			if (!asset) return NotFound();
			return new Response(await read(asset[0]), {
				headers: { "Content-Type": asset[1], "Cache-Control": "public, max-age=3600" },
			});
		});

		if (!this.#routes) return;
		if (this.#embeds) {
			this.#disposeHead = contributeRouteHead((path) => {
				if (path === undefined || path.startsWith(ASSET_BASE)) return null;
				if (this.#base && path !== this.#base && !path.startsWith(`${this.#base}/`)) return null;
				return <link rel="stylesheet" href={STYLESHEET} />;
			});
		}

		// One literal route per page, so a static build can enumerate the site from the router
		// alone. The catch-all serves the same table, which is how pages added while watching appear.
		for (const route of this.#content.routes.keys()) {
			this.route(`${this.#base}/${route}` || "/").get((ctx) =>
				this.page(ctx as RouterContext, route)
			);
		}
		this.route(`${this.#base}/*`).get((ctx) => {
			const path = decodeURIComponent(new URL(ctx.request.url).pathname);
			return this.page(ctx as RouterContext, path.slice(this.#base.length + 1).replace(/\/$/, ""));
		});
	}

	async page(ctx: RouterContext, route: string): Promise<Response> {
		const choice = this.#resolve?.(ctx) ?? {};
		let frame = choice.frame && FRAMES.includes(choice.frame) ? choice.frame : this.#frame;
		if (frame !== "document" && typeof (ctx.state as LayoutState).layout !== "function") {
			this.#warnOnce(
				"layout",
				`gutenbearg: the "${frame}" frame renders inside the app's Layout(), and none ran before ` +
					"this route; serving whole documents instead.",
			);
			frame = "document";
		}
		const rendered = renderRoute(this.#context(route, choice.layout, frame));
		if (frame === "document") {
			const html = await renderToString(rendered.view, { url: ctx.request.url });
			return Html("<!DOCTYPE html>" + html, rendered.status);
		}
		const res = await Page(rendered.view, rendered.title)(ctx, () => Promise.resolve(NotFound()));
		if (res.status === rendered.status) return res;
		return new Response(res.body, { status: rendered.status, headers: res.headers });
	}

	async #watch() {
		let timer: ReturnType<typeof setTimeout> | undefined;
		for await (const _ of Deno.watchFs(this.#loader.dir, { recursive: true })) {
			clearTimeout(timer);
			timer = setTimeout(async () => {
				try {
					this.#content = await this.#loader.load();
					this.#sprite = null;
					console.log(`gutenbearg: reloaded ${this.#content.routes.size} routes`);
					this.#report(this.#content.diagnostics);
				} catch (e) {
					console.error("gutenbearg: reload failed:", e);
				}
			}, 80);
		}
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
 * A documentation site as a router module. Loads `dir` (`.bearmetal/gutenbearg` by default) and
 * serves one route per page, the home page at `base`, a 404 for everything else under it, and the
 * stylesheet, client script and icons at the reserved `/@bearmetal/gutenbearg` path.
 *
 * Mount it after anything that should win over its catch-all. With `frame: "shell"` or
 * `"article"`, mount it after the app's `Layout()` too: pages then render inside the app's own
 * document, and the stylesheet is added to that document's `<head>` on routes under `base`.
 *
 * @example
 * ```ts
 * router.use(await gutenbeargModule({ watch: true }));
 * ```
 */
export async function gutenbeargModule(
	options: GutenbeargOptions = {},
): Promise<GutenbeargModule> {
	const loader = new ContentLoader(options.dir ?? DEFAULT_DIR, options);
	return new GutenbeargModule(loader, await loader.load(), options);
}
