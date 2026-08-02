/**
 * Test helpers for code that drives the microdom.
 *
 * These are not DOM APIs — they are the small utilities every test that
 * exercises custom element lifecycles ends up writing.
 *
 * @module
 */

import { SlagDocument } from "./lib/document.ts";
import type { SlagElement } from "./lib/element.ts";
import { resetCustomElements } from "./lib/custom_elements.ts";

/**
 * A fresh, connected mount point.
 *
 * Nodes appended under it are live, so custom element reactions fire — the
 * element is attached to `document.body`, which is what makes it connected.
 *
 * @param document Defaults to the installed `globalThis.document`.
 */
export function createRoot(document?: SlagDocument): SlagElement {
	const doc = document ?? (globalThis.document as unknown as SlagDocument);
	if (!(doc instanceof SlagDocument)) {
		throw new Error(
			"createRoot() needs a Slag document — call installGlobals() (or import " +
				'"@bearmetal/slag/global") first, or pass one explicitly.',
		);
	}
	const root = doc.createElement("div");
	doc.body.appendChild(root);
	return root;
}

/**
 * Lets pending microtasks run.
 *
 * `BMElement` defers its teardown with `queueMicrotask` so a same-tick reconnect
 * can cancel it, so assertions about cleanup have to await this first.
 */
export async function flushMicrotasks(times = 3): Promise<void> {
	for (let index = 0; index < times; index++) await Promise.resolve();
}

export { resetCustomElements };
