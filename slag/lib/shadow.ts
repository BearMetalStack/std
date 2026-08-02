import { SlagDocumentFragment } from "./fragment.ts";
import { NodeType } from "./node_type.ts";
import type { SlagCSSStyleSheet } from "./css.ts";
import type { SlagElement } from "./element.ts";
import type { SlagNode } from "./node.ts";

export type ShadowRootMode = "open" | "closed";

/**
 * A shadow root: a fragment-like root that knows its host.
 *
 * Slag models the *structure* — a separate subtree, `adoptedStyleSheets`, and
 * `<slot>` positions resolved at serialization time — but not live assignment.
 * `assignedNodes()` computes its answer on demand rather than being maintained
 * as light children move, which is enough for rendering and for
 * `BMElement.useShadow()`/`adoptStyleSheet()` to work off-browser.
 */
export class SlagShadowRoot extends SlagDocumentFragment {
	readonly host: SlagElement;
	readonly mode: ShadowRootMode;
	adoptedStyleSheets: SlagCSSStyleSheet[] = [];

	constructor(host: SlagElement, mode: ShadowRootMode = "open") {
		super();
		this.host = host;
		this.mode = mode;
		this.ownerDocument = host.ownerDocument;
	}

	/** The host's light children targeting the named slot. */
	assignedNodes(slotName = ""): SlagNode[] {
		return this.host.childNodes.filter((child) => {
			const target = child.nodeType === NodeType.ELEMENT_NODE
				? (child as SlagElement).getAttribute("slot") ?? ""
				: "";
			return target === slotName;
		});
	}
}
