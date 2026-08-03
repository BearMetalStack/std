/**
 * Router middleware that renders a page.
 *
 * `Layout()` puts a shell in the request state; `Page()` renders a view inside
 * it, waits for the tree to settle, works out which components it used, and
 * inlines their styles and client bundle before serializing.
 *
 * The render itself lives in `./render.ts` — this module is the part that knows
 * about HTTP and about bundling.
 *
 * @module
 */

import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import {
	Html as HTMLRes,
	type RouterContext,
	type RouterHandler,
	type StateType,
} from "@bearmetal/router";
import { isDev } from "@bearmetal/miscellanea/environment";
import { getComponentUrl, getTagStylesheet } from "../define.ts";
import { stripServerCode } from "./stripServer.ts";
import { renderToTree, serializeTree } from "./render.ts";

export {
	type RenderedTree,
	type RenderOptions,
	renderToString,
	renderToTree,
	serializeNode,
	serializeTree,
} from "./render.ts";
export { RENDER_URL } from "./context.ts";

export type LayoutState = {
	layout?: LayoutEl;
};
export type LayoutEl = (props: {
	children: JSX.Element;
	title: string;
	theme?: string;
	description?: string;
}) => JSX.Element;

export function Layout<T extends StateType>(
	jsx: LayoutEl,
): RouterHandler<T & LayoutState> {
	return async (ctx, next) => {
		(ctx.state as T & LayoutState).layout = jsx;
		return await next();
	};
}

/**
 * Renders `render` as a full response, inside the registered layout if there is
 * one.
 *
 * The request URL is scoped to the render, so a `<Router>` anywhere in the page
 * matches against it without having to be handed it explicitly.
 */
export function Page<T extends StateType>(
	render: (ctx: RouterContext<T>) => JSX.Element,
	title = "BearMetal SSR",
): RouterHandler<T> {
	return async (ctx) => {
		const layout = ctx.state.layout as LayoutState["layout"];
		const tree = await renderToTree(
			() => typeof layout === "function" ? layout({ children: render(ctx), title }) : render(ctx),
			{ url: ctx.request.url },
		);

		try {
			// Finding `<head>` in the tree rather than matching `</head>` in a string
			// is one of the things a real DOM on this side buys: the injection point
			// is an element, so there is nothing to escape, nothing to get the order
			// of, and no way for a `</head>` inside a text node to hijack it.
			const head = tree.root.querySelector("head");
			if (!head) return HTMLRes(serializeTree(tree.root));

			await injectBundle(head, usedTags(tree.root));
			return HTMLRes("<!DOCTYPE html>" + serializeTree(tree.root));
		} finally {
			tree.dispose();
		}
	};
}

/**
 * The custom element tags actually present in a rendered tree.
 *
 * A hyphen in the name is what makes an element custom — the same test the
 * browser applies.
 */
function usedTags(root: Element): Set<string> {
	const tags = new Set<string>();
	for (const el of root.querySelectorAll("*")) {
		if (el.localName.includes("-")) tags.add(el.localName);
	}
	return tags;
}

/** Appends the styles and the client bundle for `tags` to a page's `<head>`. */
async function injectBundle(head: Element, tags: Set<string>): Promise<void> {
	const componentStyles = [...tags]
		.map(getTagStylesheet)
		.filter((s): s is string => s != null)
		.join("\n");
	const componentUrls = [...tags].map(getComponentUrl).filter(Boolean) as string[];

	const [scripts, bundleStyles] = await buildBundle(componentUrls);

	const doc = head.ownerDocument!;
	const css = componentStyles + bundleStyles;
	if (css) {
		const style = doc.createElement("style");
		style.textContent = css;
		head.appendChild(style);
	}

	for (const [name, source] of scripts) {
		// Shared chunks are imported by the entries that need them, by relative
		// path; only entry outputs get inlined.
		if (name.match(/-.*\.js/)) continue;
		const script = doc.createElement("script");
		script.setAttribute("type", "module");
		script.textContent = source;
		head.appendChild(script);
	}
}

export async function buildBundle(
	componentUrls: string[],
): Promise<[Map<string, string>, string]> {
	const scripttag: Map<string, string> = new Map();

	if (componentUrls.length === 0) return [scripttag, ""];
	const entry = await Deno.makeTempFile({ suffix: ".tsx" });
	await Deno.writeTextFile(
		entry,
		`
         /** @jsxRuntime automatic */
         /** @jsxImportSource jsr:@bearmetal/jsx */
         ${componentUrls.map((url) => `import "${url}"`).join("\n")}
        `,
	);
	const bundle = await Deno.bundle({
		entrypoints: [entry, "jsr:@bearmetal/app", "jsr:@bearmetal/app/signals"],
		write: false,
		codeSplitting: true,
		platform: "browser",
		outputDir: "scripts",
		minify: !isDev(),
		sourcemap: isDev() ? "inline" : undefined,
	});

	let styletag = "";
	for (const b of bundle.outputFiles ?? []) {
		if (b.path.endsWith(".css")) {
			styletag = b.text();
		} else {
			const t = stripServerCode(b.text(), { names: serverOnlyNames });
			scripttag.set(b.path.split("/").pop()!, t);
		}
	}

	Deno.remove(entry);

	return [scripttag, styletag];
}

/** Emitted files from a bundle: script text keyed by output filename, plus concatenated CSS. */
export type BundleOutput = {
	scripts: Map<string, string>;
	styles: string;
};

/**
 * Bundles a set of entrypoints in a single pass, with code splitting on.
 *
 * Anything shared by two or more entrypoints — including the `@bearmetal/app`
 * runtime and its signals, which every component pulls in — is hoisted into a
 * `chunk-*.js` output that each entry imports by relative path. Serve every
 * output from the same URL directory and those relative imports resolve.
 *
 * Entry outputs are named after their entrypoint's basename, so callers can map
 * an output back to the entrypoint that produced it.
 */
export async function bundleEntrypoints(entrypoints: string[]): Promise<BundleOutput> {
	const scripts = new Map<string, string>();
	if (entrypoints.length === 0) return { scripts, styles: "" };

	const bundle = await Deno.bundle({
		entrypoints,
		write: false,
		codeSplitting: true,
		platform: "browser",
		outputDir: "scripts",
		minify: !isDev(),
		sourcemap: isDev() ? "inline" : undefined,
	});

	let styles = "";
	for (const file of bundle.outputFiles ?? []) {
		const name = file.path.split("/").pop()!;
		if (name.endsWith(".css")) {
			styles += file.text();
			continue;
		}
		scripts.set(name, stripServerCode(file.text(), { names: serverOnlyNames }));
	}

	return { scripts, styles };
}

/**
 * Members that exist only to serve a render, and must not reach a browser.
 *
 * `serverInit` is the one that matters: it is where a component's queries and
 * file reads live, and shipping it would drag that entire dependency tree into
 * the client bundle. `stylesheet` is already inlined into the page by
 * `injectBundle`, so a second copy in the bundle is dead weight.
 */
const serverOnlyNames = ["serverInit", "stylesheet"];

const imports = new Set<string>();
export function getImports(): string[] {
	return imports.values().toArray();
}
export function addImport(url: string) {
	imports.add(url);
}
