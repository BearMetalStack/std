/**
 * A JSX runtime that builds DOM nodes — on a client and on a server alike.
 *
 * The runtime itself is at `@bearmetal/jsx/jsx-runtime`; point
 * `jsxImportSource` there (or at this package) and write components once.
 * This module is the surrounding API: the custom element base, the raw-markup
 * wrapper, and the seams a server renderer needs.
 *
 * @module
 */

export { BMC, isBMC } from "./lib/bmc.ts";
export { Html } from "./lib/html.ts";
export { escapeHtml } from "@bearmetal/miscellanea";
export {
	currentElementBase,
	DetachedElement,
	DOM_REBASE_HOOKS,
	type ElementBase,
	notifyDomChanged,
	onDomChanged,
	rebaseOnDom,
} from "./lib/dom.ts";
export {
	beginRenderScope,
	collectInto,
	endRenderScope,
	isServerRendering,
	type RenderScope,
	trackPending,
} from "./lib/pending.ts";
export {
	flatChildren,
	Fragment,
	getCurrentOwner,
	type HtmlLike,
	jsx,
	jsxs,
	type Owner,
	setCurrentOwner,
	setEffectImpl,
	setUntrackImpl,
} from "./lib/jsx.ts";

export type * from "./types.ts";
