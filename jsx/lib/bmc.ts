import { DetachedElement, type ElementBase, rebaseOnDom } from "./dom.ts";

const _MARKER: unique symbol = Symbol.for("bearmetal.bmc");

/**
 * The base every BearMetal custom element extends.
 *
 * `BMC` is an `HTMLElement` — whichever one is ambient. It is declared against
 * a placeholder and re-pointed at the real base as soon as one exists, so a
 * module may reach it before or after the DOM globals are installed and get the
 * same class either way. See `./dom.ts` for how, and why that is not optional.
 *
 * There is one rendering path: the JSX runtime builds real nodes, in a browser
 * and on a server alike. A component therefore has no server-only counterpart
 * to keep in sync — no `serverRender`, no `serverLoad`, no second template.
 * What replaces them lives on `BMElement` in `@bearmetal/app`: one `template`,
 * and a `serverInit()` the server awaits before it serializes.
 */
export abstract class BMC extends (DetachedElement as ElementBase) {
	static readonly [_MARKER] = true;
	static tag: string;

	/**
	 * Marks a component as client-only: the server emits its tag and attributes
	 * and stops there, leaving it to render when it upgrades in the browser.
	 *
	 * For the few things that genuinely cannot run server-side — a canvas, a
	 * media player, a map. Everything else should render, so the page has
	 * content before the bundle lands.
	 */
	static client: boolean = false;

	/** The nearest ancestor element that is also a BearMetal component. */
	get parentBMC(): BMC | null {
		let current = (this as unknown as { parentElement: Element | null }).parentElement;
		while (current && !isBMC(current.constructor)) {
			current = current.parentElement;
		}
		return current as unknown as BMC | null;
	}
}

rebaseOnDom(BMC);

/**
 * Whether `v` is a `BMC` subclass.
 *
 * Takes the **constructor**, not an instance — this is what the JSX runtime
 * asks about a tag. For an instance, pass `instance.constructor`.
 */
export function isBMC(v: unknown): v is typeof BMC {
	// deno-lint-ignore no-explicit-any
	return typeof v === "function" && (v as any)[_MARKER] === true;
}
