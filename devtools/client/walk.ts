import { isBMC, isComponentElement } from "@bearmetal/app";
import type { BMElement, SignalBinding } from "@bearmetal/app";

export interface TreeNode {
	element: BMElement;
	bindings: SignalBinding[];
}

export interface WalkOptions {
	/** Excluded, along with its subtree — the overlay's own root element. */
	skip?: Element;
}

/**
 * Walks the live DOM under `root`, shadow-piercing, returning every
 * `BMElement` found keyed by a stable, disambiguated address.
 *
 * Uses `isBMC()` plus a duck-typed `signalBindings()` call rather than
 * `instanceof BMElement` — devtools ships its own bundle, a different copy of
 * `@bearmetal/app`/`@bearmetal/jsx` than the inspected app's, so `instanceof`
 * would silently match nothing. `isBMC` checks a `Symbol.for(...)`-interned
 * marker, which is shared across bundle copies within one realm.
 *
 * The sibling counter is keyed by (address prefix, tag) and threaded through
 * the *entire* walk, not reset per actual DOM parent: two same-tag components
 * each wrapped in their own transparent `<li>`/`<div>` at the same logical
 * depth — an ordinary list-of-cards pattern — would otherwise both compute as
 * "the first `<card>` under this parent" and collide on one address.
 */
export function walkTree(
	root: Element | ShadowRoot,
	options: WalkOptions = {},
): Map<string, TreeNode> {
	const out = new Map<string, TreeNode>();
	const siblingCounts = new Map<string, number>(); // key: `${prefix}::${tag}`
	walkChildren(root, "", options.skip, out, siblingCounts);
	return out;
}

function walkChildren(
	parent: Element | ShadowRoot,
	prefix: string,
	skip: Element | undefined,
	out: Map<string, TreeNode>,
	siblingCounts: Map<string, number>,
): void {
	for (const child of parent.children) {
		if (child === skip) continue;

		let address = prefix;
		if (isComponentElement(child)) {
			const tag = child.localName;
			const countKey = `${prefix}::${tag}`;
			const index = siblingCounts.get(countKey) ?? 0;
			siblingCounts.set(countKey, index + 1);
			address = prefix ? `${prefix}>${tag}[${index}]` : `${tag}[${index}]`;

			if (
				isBMC(child.constructor) &&
				typeof (child as unknown as { signalBindings?: unknown }).signalBindings === "function"
			) {
				try {
					out.set(address, {
						element: child as unknown as BMElement,
						bindings: (child as unknown as BMElement).signalBindings(),
					});
				} catch (error) {
					console.warn(`devtools: signalBindings() threw for <${tag}>, skipping it`, error);
				}
			}
		}

		const shadow = (child as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
		if (shadow) walkChildren(shadow, address, skip, out, siblingCounts);
		walkChildren(child, address, skip, out, siblingCounts);
	}
}
