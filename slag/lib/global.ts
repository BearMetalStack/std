/**
 * Installing Slag over the platform globals.
 *
 * ## Import order does not matter
 *
 * It used to. `BMC` captured `globalThis.HTMLElement` as its base class when
 * its module was evaluated, and the JSX runtime picked a client or server half
 * from `typeof document` at the same moment — so both had to be imported
 * *after* the globals existed, and a `.tsx` file could not arrange that at all,
 * since the JSX transform injects its runtime import above everything the
 * source writes.
 *
 * Neither is true now. There is one JSX runtime, which reads `document` when it
 * is called, and {@linkcode installGlobals} announces itself to anything that
 * had to pick a base class early, which re-points its prototype chain at the
 * real `HTMLElement`. Install the globals whenever you like — top of the file,
 * inside a test body — and everything that already loaded catches up.
 *
 * ```ts
 * import { installGlobals } from "@bearmetal/slag";
 *
 * const uninstall = installGlobals({ url: "https://example.com/about" });
 * ```
 *
 * The side-effect form (`@bearmetal/slag/global`) still exists and is still the
 * least ceremony for a whole-file install.
 */

import { SlagDocument } from "./document.ts";
import { SlagWindow } from "./window.ts";
import { customElementRegistry } from "./custom_elements.ts";
import { SlagCSSStyleSheet } from "./css.ts";
import { SlagElement, SlagHTMLElement, SlagSVGElement, SlagTemplateElement } from "./element.ts";
import { SlagComment, SlagNode, SlagText } from "./node.ts";
import { SlagDocumentFragment } from "./fragment.ts";
import { SlagShadowRoot } from "./shadow.ts";

/**
 * Where classes that must extend the ambient `HTMLElement` park their
 * "the DOM changed, re-point yourself" callbacks.
 *
 * Reached through a global symbol rather than an import: `@bearmetal/jsx`
 * registers `BMC` here, and Slag sits *below* jsx in the dependency graph, so
 * importing it would invert that. See `jsx/lib/dom.ts` for the other half.
 */
const DOM_REBASE_HOOKS: unique symbol = Symbol.for("bearmetal.dom.rebaseHooks");

/** Tells every rebased class that `globalThis.HTMLElement` has changed. */
function notifyDomChanged(): void {
	// deno-lint-ignore no-explicit-any
	const hooks = (globalThis as any)[DOM_REBASE_HOOKS] as Set<() => void> | undefined;
	if (!hooks) return;
	for (const hook of hooks) hook();
}

const GLOBAL_NAMES = [
	"window",
	"document",
	"location",
	"history",
	"customElements",
	"Node",
	"Text",
	"Comment",
	"Element",
	"HTMLElement",
	"SVGElement",
	"HTMLTemplateElement",
	"DocumentFragment",
	"ShadowRoot",
	"CSSStyleSheet",
] as const;

export interface InstallGlobalsOptions {
	/** Reuse an existing document instead of creating a fresh one. */
	document?: SlagDocument;
	/** Initial `location.href`. Defaults to `http://localhost/`. */
	url?: string | URL;
}

/**
 * Installs Slag's classes on `globalThis`.
 *
 * Announces itself afterwards, so classes that had to extend `HTMLElement`
 * before one existed can re-point at the real base — which is what makes the
 * order of this call relative to the rest of the imports stop mattering.
 *
 * @returns A teardown that restores whatever was there before — including
 * "nothing", so a test file that installs Slag will not leak it into a file that
 * brings its own shim.
 */
export function installGlobals(options: InstallGlobalsOptions = {}): () => void {
	// deno-lint-ignore no-explicit-any
	const global = globalThis as any;
	const previous = new Map<string, { present: boolean; value: unknown }>();
	for (const name of GLOBAL_NAMES) {
		previous.set(name, { present: name in global, value: global[name] });
	}

	const document = options.document ?? new SlagDocument();
	const window = new SlagWindow(document, options.url);

	global.window = window;
	global.document = document;
	global.location = window.location;
	global.history = window.history;
	global.customElements = customElementRegistry;
	global.Node = SlagNode;
	global.Text = SlagText;
	global.Comment = SlagComment;
	global.Element = SlagElement;
	global.HTMLElement = SlagHTMLElement;
	global.SVGElement = SlagSVGElement;
	global.HTMLTemplateElement = SlagTemplateElement;
	global.DocumentFragment = SlagDocumentFragment;
	global.ShadowRoot = SlagShadowRoot;
	global.CSSStyleSheet = SlagCSSStyleSheet;

	notifyDomChanged();

	return () => {
		for (const [name, before] of previous) {
			if (before.present) global[name] = before.value;
			else delete global[name];
		}
		notifyDomChanged();
	};
}

/** Namespace form of {@linkcode installGlobals}. */
export class Slag {
	/** Installs the microdom globally. Discards the teardown; see `installGlobals`. */
	static injectGlobalMicrodom(options?: InstallGlobalsOptions): void {
		installGlobals(options);
	}
}
