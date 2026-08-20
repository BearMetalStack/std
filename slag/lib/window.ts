import { SlagDocument } from "./document.ts";
import { SlagHistory, SlagLocation } from "./location.ts";
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

	/**
	 * The current URL, and the history stack that moves it.
	 *
	 * Navigating either one dispatches `popstate`/`hashchange` on the window,
	 * exactly as a browser would, so code that listens for them works unchanged.
	 * Both are per-window, which on a server means per-process — see
	 * `./location.ts` for why that makes them a convenience rather than a source
	 * of truth for routing.
	 */
	readonly location: SlagLocation;
	readonly history: SlagHistory;

	constructor(document: SlagDocument = new SlagDocument(), url?: string | URL) {
		super();
		this.document = document;

		let previousHash = "";
		this.location = new SlagLocation(url, (href) => {
			const hash = new URL(href).hash;
			if (hash !== previousHash) {
				previousHash = hash;
				this.dispatchEvent(new Event("hashchange"));
			}
		});
		previousHash = new URL(this.location.href).hash;
		this.history = new SlagHistory(this.location, () => {
			this.dispatchEvent(new Event("popstate"));
		});
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
