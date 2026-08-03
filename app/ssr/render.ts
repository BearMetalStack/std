/**
 * Server rendering.
 *
 * The shape of it, in order:
 *
 * 1. Build the tree, synchronously. Components render exactly as they do in a
 *    browser, because it is the same runtime and the same `template` — the
 *    `document` underneath is `@bearmetal/slag` instead of a browser's.
 * 2. Collect. A component with a `serverInit()` starts it as it connects and
 *    hands the promise to the render scope rather than blocking on it, so the
 *    whole page's I/O overlaps instead of serialising itself down the tree.
 * 3. Settle. Await the batch, flush the effects the resolved state dirtied, and
 *    repeat while that produces more work — a component whose `serverInit()`
 *    reveals another component gets its turn too.
 * 4. Snapshot `@state` into the markup, and serialize.
 *
 * Rendering being synchronous is what makes step 1 safe to run against shared
 * globals: nothing can interleave with it, so a render never sees another
 * request's `document` or URL. That also makes the call-stack context in
 * `../context/stackContext.ts` a sound place to put per-render values, which is
 * where the URL a `<Router>` matches against comes from.
 *
 * @module
 */

import { installGlobals, serialize, serializeInner, type SlagDocument } from "@bearmetal/slag";
import type { ShadowSerialization } from "@bearmetal/slag/types";
import { beginRenderScope, collectInto, endRenderScope, Fragment } from "@bearmetal/jsx";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { flushEffects } from "../signals.ts";
import { withContext } from "../context/stackContext.ts";
import { RENDER_URL } from "./context.ts";

/** How the microdom is set up, if it has not been already. */
let installed = false;

/**
 * Installs the microdom over the DOM globals, once per process.
 *
 * Renders share it deliberately. A `document` is a node factory and a place to
 * hang custom element definitions; the tree a render builds is its own, rooted
 * in its own detached host, so two requests in flight cannot see each other's
 * markup. Giving each request a document would buy nothing and cost a
 * registry's worth of re-registration.
 */
function ensureDom(): void {
	if (installed) return;
	installed = true;
	if (typeof document === "undefined") installGlobals();
}

/** Options shared by every server render entry point. */
export interface RenderOptions {
	/**
	 * The URL being rendered — normally `ctx.request.url`.
	 *
	 * Scoped to this render through the call-stack context, so it is correct
	 * per request without a global to race over. `<Router>` matches against it
	 * when it has no `url` prop of its own, and `<Link>` resolves relative
	 * hrefs against it.
	 */
	url?: string | URL;
	/** How shadow roots are rendered. Defaults to `"declarative"`. */
	shadow?: ShadowSerialization;
	/**
	 * How many settle passes to allow before giving up. Each pass is one round
	 * of "await what the last one started". Defaults to 10, which is far more
	 * than a page that is not looping needs.
	 */
	maxPasses?: number;
	/** Render into an explicit document instead of the ambient one. */
	document?: SlagDocument;
}

/** A rendered tree, and the means to put it away. */
export interface RenderedTree {
	/**
	 * The detached element holding the render. Its *children* are the output;
	 * the host itself is scaffolding and is never serialized.
	 */
	root: Element;
	/** Detaches the tree and runs every component's cleanup. */
	dispose(): void;
}

const DEFAULT_MAX_PASSES = 10;

/** Origin a path-only render URL is resolved against. */
const LOCAL_BASE = "http://localhost/";

/**
 * Renders `view` and settles every `serverInit()` and promise it raised.
 *
 * Returns the live tree rather than a string, for callers that need to look at
 * it first — which is how the page bundler finds the custom elements it has to
 * ship, and where in the document to put them. Call `dispose()` when done.
 */
export async function renderToTree(
	view: () => JSX.Element,
	options: RenderOptions = {},
): Promise<RenderedTree> {
	ensureDom();

	const doc = options.document ?? (document as unknown as SlagDocument);
	const host = doc.createElement("div") as unknown as Element;
	// Connected, because that is what makes custom element reactions fire — the
	// same rule as a browser. The host comes back out before anything is read.
	(doc.body as unknown as Element).appendChild(host);

	// Absolute, because everything downstream resolves relative links against it
	// — and `new URL("/", "/about")` is an error, not a path. A bare path is the
	// normal thing to hand a renderer, so the base is supplied here rather than
	// demanded of the caller.
	const url = options.url == null ? undefined : new URL(options.url, LOCAL_BASE).href;
	const scoped = <T>(fn: () => T): T => withContext({ [RENDER_URL]: url }, fn);

	const scope = beginRenderScope();
	try {
		let { work } = collectInto(scope, () =>
			scoped(() => {
				host.appendChild(Fragment({ children: view() }));
				flushEffects();
			}));

		const maxPasses = options.maxPasses ?? DEFAULT_MAX_PASSES;
		for (let pass = 0; work.length > 0; pass++) {
			if (pass >= maxPasses) {
				console.warn(
					`renderToTree() stopped after ${maxPasses} settle passes with work still ` +
						"outstanding. A serverInit() is probably starting new work every time it " +
						"settles; the markup below it may be incomplete.",
				);
				break;
			}
			// `allSettled`: one component failing to load is a hole in the page, not
			// a reason to lose the rest of it. The rejection is reported and the
			// render carries on with whatever that component rendered without it.
			for (const result of await Promise.allSettled(work)) {
				if (result.status === "rejected") {
					console.error("serverInit() rejected during server render:", result.reason);
				}
			}
			work = collectInto(scope, () => scoped(flushEffects)).work;
		}
	} finally {
		endRenderScope(scope);
	}

	host.remove();
	snapshotState(host);

	return {
		root: host,
		dispose: () => {
			host.replaceChildren();
		},
	};
}

/** Renders `view` and returns its markup. */
export async function renderToString(
	view: () => JSX.Element,
	options: RenderOptions = {},
): Promise<string> {
	const tree = await renderToTree(view, options);
	try {
		return serializeTree(tree.root, options);
	} finally {
		tree.dispose();
	}
}

/** Serializes a rendered tree's children — the host element itself is scaffolding. */
export function serializeTree(root: Element, options: RenderOptions = {}): string {
	return serializeInner(root as never, { shadow: options.shadow ?? "declarative" });
}

/** Serializes one node, tag included. */
export function serializeNode(node: Node, options: RenderOptions = {}): string {
	return serialize(node as never, { shadow: options.shadow ?? "declarative" });
}

/** What a component looks like from out here: something that can snapshot itself. */
interface StatefulElement extends Element {
	serializeState(): void;
}

function isStateful(node: Element): node is StatefulElement {
	return typeof (node as StatefulElement).serializeState === "function";
}

/**
 * Writes every component's `@state` into its markup, once the tree has settled.
 *
 * Done here rather than as each component finishes because a component's state
 * is only final when the whole render is: a later pass may still write to it.
 */
function snapshotState(root: Element): void {
	for (const el of walk(root)) {
		if (isStateful(el)) el.serializeState();
	}
}

/** Every element under `root`, descending through shadow roots as well. */
function* walk(root: Element | ShadowRoot): Generator<Element> {
	for (const child of root.children) {
		yield child;
		const shadow = (child as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
		if (shadow) yield* walk(shadow);
		yield* walk(child);
	}
}
