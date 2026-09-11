/**
 * Keeping the server's `@state` reachable after the client rebuilds the page.
 *
 * A component's first client render does not adopt the markup the server sent —
 * it renders its `template` again and replaces its children with the result.
 * That is what binds handlers, refs and effects to live nodes, and it is fine
 * for the component doing it. What it costs is every component *inside* it: the
 * server-rendered `<user-card>` that had already read its `data-bm-state` is
 * thrown away, and the freshly built one in its place has no attribute to read.
 * `@state` therefore worked only for components a view rendered directly, and
 * silently did nothing one level down — the deeper the component, the more
 * certain it was to lose the data it was supposed to start from.
 *
 * Adopting the server's DOM instead would fix it at the root, and cannot be done
 * from inside the JSX runtime: the automatic runtime builds bottom-up, so `jsx()`
 * runs for a child long before the parent it would have to be positioned inside
 * exists. There is no cursor to walk.
 *
 * So the snapshots are lifted out of the DOM before any of it is discarded, and
 * kept here. A rebuilt element with no attribute of its own asks for the
 * snapshot belonging to its position, and the position is a *path* — the chain
 * of custom element tags from the document root down to it — so a component can
 * only ever receive state that was rendered somewhere structurally identical.
 *
 * @module
 */

import { isComponentElement } from "./util/dom.ts";

/** Where a server render leaves the `@state` it wants the browser to pick up. */
export const STATE_ATTRIBUTE = "data-bm-state";

/**
 * Snapshots left by the server, queued by structural path.
 *
 * A queue rather than a single value because a path is not unique: three
 * `<user-card>`s in the same list share one. They are consumed in document
 * order, which is the order the client rebuilds them in.
 */
let queues: Map<string, string[]> | null = null;

/**
 * Whether snapshots may still be claimed.
 *
 * Hydration is a boot phase: the state in the markup describes the page the
 * server sent, and stops describing anything once the page starts moving. A
 * component built by a later re-render is a genuinely new component and must
 * start empty — without this, it would claim the next queued snapshot, which
 * belongs to one of its siblings.
 */
let booting = true;

/**
 * The chain of custom element tags from the root down to `el`, inclusive.
 *
 * Ordinary elements are not part of it. Wrapping a component in another `<div>`
 * on one side and not the other is a layout change, not a change of identity,
 * and should not cost the component its state.
 */
function path(el: Element): string {
	const parts: string[] = [];
	let node: Element | null = el;
	while (node) {
		if (isComponentElement(node)) parts.push(node.localName);
		const parent: Element | null = node.parentElement;
		if (parent) {
			node = parent;
			continue;
		}
		// Out through a shadow boundary, where `parentElement` gives up.
		const root = node.getRootNode?.() as ShadowRoot | undefined;
		node = root && "host" in root ? root.host : null;
	}
	return parts.reverse().join(">");
}

/**
 * Lifts every snapshot in the document into {@linkcode queues}.
 *
 * Called lazily by the first component to hydrate, which is the last moment at
 * which the document is still exactly as the server sent it: that component has
 * not yet read its own attribute, and nothing has re-rendered.
 */
function collect(): Map<string, string[]> {
	const collected = new Map<string, string[]>();
	// Not `isBrowser()`: this runs wherever a component connects outside a server
	// render, which includes a test against the microdom. A document is all it
	// needs, and without one there is nothing to collect.
	if (typeof document === "undefined") return collected;

	for (const el of document.querySelectorAll(`[${STATE_ATTRIBUTE}]`)) {
		const raw = el.getAttribute(STATE_ATTRIBUTE);
		if (raw == null) continue;
		const key = path(el);
		const queue = collected.get(key);
		if (queue) queue.push(raw);
		else collected.set(key, [raw]);
	}

	// One macrotask is past the whole synchronous upgrade cascade and the
	// microtasks its effects run in, and comfortably short of anything a user
	// could have done to make the page re-render.
	setTimeout(() => {
		booting = false;
		queues = null;
	}, 0);

	return collected;
}

/**
 * The snapshot for `el`'s position, if the server left one that nothing has
 * claimed yet.
 *
 * Only for an element with no `data-bm-state` of its own — one the client built
 * to replace something the server sent.
 */
export function takeServerState(el: Element): string | undefined {
	if (!booting) return undefined;
	queues ??= collect();
	return queues.get(path(el))?.shift();
}

/** Forgets everything collected. Exported for tests. */
export function resetHydration(): void {
	queues = null;
	booting = true;
}
