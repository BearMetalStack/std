/**
 * Installing Slag over the platform globals.
 *
 * ## Import order matters
 *
 * Some modules in this stack read DOM globals at **module-evaluation time**, not
 * at call time:
 *
 * - `@bearmetal/jsx`'s `BMC` captures `globalThis.HTMLElement` to use as its base
 *   class the moment the module is imported.
 * - `@bearmetal/jsx/jsx-runtime` picks the client or server runtime from
 *   `typeof document !== "undefined"`, once, on import.
 *
 * So the globals have to exist *before* those modules load. Static imports are
 * evaluated in source order, which makes a side-effect import the reliable way
 * to guarantee it:
 *
 * ```ts
 * import "@bearmetal/slag/global"; // must come first
 * import { MyComponent } from "./my-component.ts"; // reaches jsx/app
 * ```
 *
 * The second line names a local module on purpose. `dep_graph.ts` scans source
 * text for import specifiers and cannot tell a doc comment from real code, so
 * spelling a workspace package here would invent a `slag -> app` edge and
 * reverse the publish order.
 *
 * Calling {@linkcode installGlobals} from inside a test body is too late for
 * those two, though it is fine for anything that reads `document` lazily.
 */

import { SlagDocument } from "./document.ts";
import { SlagWindow } from "./window.ts";
import { customElementRegistry } from "./custom_elements.ts";
import { SlagCSSStyleSheet } from "./css.ts";
import { SlagElement, SlagHTMLElement, SlagSVGElement, SlagTemplateElement } from "./element.ts";
import { SlagComment, SlagNode, SlagText } from "./node.ts";
import { SlagDocumentFragment } from "./fragment.ts";
import { SlagShadowRoot } from "./shadow.ts";

const GLOBAL_NAMES = [
	"window",
	"document",
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
}

/**
 * Installs Slag's classes on `globalThis`.
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
	const window = new SlagWindow(document);

	global.window = window;
	global.document = document;
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

	return () => {
		for (const [name, before] of previous) {
			if (before.present) global[name] = before.value;
			else delete global[name];
		}
	};
}

/** Namespace form of {@linkcode installGlobals}. */
export class Slag {
	/** Installs the microdom globally. Discards the teardown; see `installGlobals`. */
	static injectGlobalMicrodom(options?: InstallGlobalsOptions): void {
		installGlobals(options);
	}
}
