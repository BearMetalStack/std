/**
 * Slag — a microdom for BearMetal.
 *
 * A small, dependency-light DOM implementation that runs anywhere Deno does.
 * It exists for two jobs:
 *
 * 1. **Testing.** `deno test` has no `document`. Build a tree, drive it, assert
 *    on the markup — including custom element connect/disconnect reactions,
 *    which are the part hand-rolled test shims always get subtly wrong.
 * 2. **One rendering surface.** Nodes serialize themselves, so the same code can
 *    build DOM in a browser and HTML on a server.
 *
 * ```ts
 * import { SlagDocument } from "@bearmetal/slag";
 *
 * const document = new SlagDocument();
 * const el = document.createElement("p");
 * el.textContent = "hello";
 * el.toString(); // "<p>hello</p>"
 * ```
 *
 * To run browser-targeted code unchanged, install it over the globals — see
 * `installGlobals`, and note the import-order caveat documented there.
 *
 * @module
 */

export { NodeType } from "./lib/node_type.ts";
export { SlagCharacterData, SlagComment, SlagNode, SlagRawMarkup, SlagText } from "./lib/node.ts";
export { SlagDocumentFragment } from "./lib/fragment.ts";
export { SlagShadowRoot } from "./lib/shadow.ts";
export {
	HTML_NAMESPACE,
	SlagElement,
	SlagHTMLElement,
	SlagSVGElement,
	SlagTemplateElement,
	SlagTokenList,
	SVG_NAMESPACE,
} from "./lib/element.ts";
export { SlagDocument } from "./lib/document.ts";
export { SlagWindow } from "./lib/window.ts";
export { SlagHistory, SlagLocation } from "./lib/location.ts";
export { createStyleDeclaration, SlagCSSStyleSheet } from "./lib/css.ts";
export {
	customElementRegistry,
	resetCustomElements,
	SlagCustomElementRegistry,
} from "./lib/custom_elements.ts";
export { serialize, serializeInner, voidElements } from "./lib/serialize.ts";
export { matchesSelector, parseSelector, querySelector, querySelectorAll } from "./lib/selector.ts";
export { installGlobals, Slag } from "./lib/global.ts";

export type * from "./types.ts";
