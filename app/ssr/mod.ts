/**
 * Router middleware that renders a page.
 *
 * `Layout()` puts a shell in the request state; `Page()` renders a view inside
 * it, waits for the tree to settle, and serializes it with whatever has
 * registered itself as belonging in `<head>`.
 *
 * The render itself lives in `./render.ts`; building a client bundle lives in
 * `./bundle.ts`. This module is the part that knows about HTTP.
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
import { hasHeadContributors, headContributions } from "./head.ts";
import { renderToTree, serializeTree } from "./render.ts";
import { isComponentElement } from "../util/dom.ts";

export { bundleEntrypoints, type BundleOutput } from "./bundle.ts";
export { mirrorStripped, type StripOptions, type StrippedTree } from "./prestrip.ts";
export { contributeHead, hasHeadContributors, type HeadContributor } from "./head.ts";
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
 *
 * What the browser then loads is not decided here. `Page()` appends whatever
 * has registered a {@linkcode contributeHead} contributor — normally
 * `@bearmetal/stack`'s components module, which serves one bundle for the whole
 * app. Assembling a bundle per page from the tags the page happened to use is
 * what this used to do, and it cannot work once a client-side `<Router>` starts
 * navigating: the next page's components were never shipped.
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

			for (const node of headContributions()) head.appendChild(node);
			warnIfNothingHydrates(tree.root);

			return HTMLRes("<!DOCTYPE html>" + serializeTree(tree.root));
		} finally {
			tree.dispose();
		}
	};
}

/** Said once per process, however many pages go out without a bundle behind them. */
let warnedAboutClient = false;

/**
 * Warns when a page renders components but nothing is shipping them.
 *
 * The failure this catches is quiet in every other way: the markup is correct,
 * the response is a 200, and the components simply never upgrade. Registering
 * the components module (`.use(createStack())`) is what fills `<head>` in, so
 * an empty `<head>` contribution list and a page full of custom elements is
 * always the same mistake.
 */
function warnIfNothingHydrates(root: Element): void {
	if (warnedAboutClient || hasHeadContributors()) return;
	const tag = [...usedTags(root)][0];
	if (!tag) return;
	warnedAboutClient = true;
	console.warn(
		`This page rendered <${tag}> but nothing is contributing to <head>, so no client ` +
			"bundle is being served and none of its components will upgrade in the browser. " +
			"Mount the components module — router.use(createStack()) from @bearmetal/stack.",
	);
}

/**
 * The custom element tags actually present in a rendered tree.
 *
 * A hyphen in the name is what makes an element custom — the same test the
 * browser applies.
 */
export function usedTags(root: Element): Set<string> {
	const tags = new Set<string>();
	for (const el of root.querySelectorAll("*")) {
		if (isComponentElement(el)) tags.add(el.localName);
	}
	return tags;
}
