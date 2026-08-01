import { SlagDocument } from "./document.ts";
import { customElementRegistry, type SlagCustomElementRegistry } from "./custom_elements.ts";
import { SlagCSSStyleSheet, type SlagStyleDeclaration } from "./css.ts";
import { SlagElement, SlagHTMLElement, SlagSVGElement, SlagTemplateElement } from "./element.ts";
import { SlagComment, SlagNode, SlagText } from "./node.ts";
import { SlagDocumentFragment } from "./fragment.ts";
import { SlagShadowRoot } from "./shadow.ts";

/** The subset of `MediaQueryList` `matchMedia` returns. Never matches. */
export interface SlagMediaQueryList {
	matches: boolean;
	media: string;
	addEventListener(): void;
	removeEventListener(): void;
	addListener(): void;
	removeListener(): void;
}

/**
 * The `window` global.
 *
 * Everything here that a server cannot meaningfully answer — layout, media
 * queries, animation frames — returns a neutral value instead of throwing.
 * Client code that guards on `typeof window !== "undefined"` will now take its
 * browser branch, so those branches have to survive the trip.
 */
export class SlagWindow extends EventTarget {
	readonly document: SlagDocument;
	readonly customElements: SlagCustomElementRegistry = customElementRegistry;

	readonly Node: typeof SlagNode = SlagNode;
	readonly Text: typeof SlagText = SlagText;
	readonly Comment: typeof SlagComment = SlagComment;
	readonly Element: typeof SlagElement = SlagElement;
	readonly HTMLElement: typeof SlagHTMLElement = SlagHTMLElement;
	readonly SVGElement: typeof SlagSVGElement = SlagSVGElement;
	readonly HTMLTemplateElement: typeof SlagTemplateElement = SlagTemplateElement;
	readonly DocumentFragment: typeof SlagDocumentFragment = SlagDocumentFragment;
	readonly ShadowRoot: typeof SlagShadowRoot = SlagShadowRoot;
	readonly CSSStyleSheet: typeof SlagCSSStyleSheet = SlagCSSStyleSheet;

	readonly innerWidth = 0;
	readonly innerHeight = 0;
	readonly devicePixelRatio = 1;

	constructor(document: SlagDocument = new SlagDocument()) {
		super();
		this.document = document;
	}

	get self(): SlagWindow {
		return this;
	}

	get window(): SlagWindow {
		return this;
	}

	/** Returns the element's own inline style — nothing is ever computed. */
	getComputedStyle(element: SlagElement): SlagStyleDeclaration {
		return element.style;
	}

	matchMedia(query: string): SlagMediaQueryList {
		return {
			matches: false,
			media: query,
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
		};
	}

	requestAnimationFrame(callback: (time: number) => void): number {
		return setTimeout(() => callback(performance.now()), 0) as unknown as number;
	}

	cancelAnimationFrame(handle: number): void {
		clearTimeout(handle);
	}
}
