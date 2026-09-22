/**
 * Replacing a live component's class during development.
 *
 * A dev server that re-imports a changed component module gets a new class for
 * a tag the registry already holds, and `customElements.define` cannot be asked
 * twice. Patching the new class's methods onto the old one is not enough: every
 * `#private` field and `accessor` is branded to the class that declared it, so
 * the new methods throw the moment they touch an instance the old class built.
 *
 * So while hot replacement is on, the registry is given a stand-in constructor
 * that builds its instances from whichever implementation is current. A swap
 * re-points the stand-in at the new class and replaces every live instance with
 * a freshly built one, carrying `@state` across through the same
 * `data-bm-state` hydration a server render uses and `@prop` values directly.
 * Anything held only in plain or private fields starts over.
 *
 * Off unless something turns it on before any component module is evaluated:
 * a dev server's client sets `globalThis.__bmHmr` in the browser, and a dev
 * server process calls {@linkcode enableHotReplacement} so the classes it
 * renders with can be replaced too.
 *
 * @module
 */

import { STATE_ATTRIBUTE } from "./hydration.ts";
import { declaredProps } from "./prop.ts";
import { isBrowser } from "./util/environment.ts";

/** Dispatched on `globalThis` once for every hot-swapped tag. */
export const HMR_EVENT = "bearmetal:hmr";

/** The detail of an {@linkcode HMR_EVENT}. */
export interface HmrEventDetail {
	tag: string;
	/** False when the swap could not be done in place and the page must reload. */
	ok: boolean;
	reason?: string;
}

type HotConstructor = CustomElementConstructor & {
	stylesheet?: string | CSSStyleSheet;
	observedAttributes?: readonly string[];
};

interface HotRecord {
	current: HotConstructor;
	standIn: HotConstructor;
}

const records = new Map<string, HotRecord>();

/** Whether hot replacement is on in this realm. */
export function isHotEnabled(): boolean {
	return (globalThis as { __bmHmr?: boolean }).__bmHmr === true;
}

/**
 * Turns hot replacement on for every component defined from here on.
 *
 * For a dev server process, so that re-importing a changed component module
 * swaps the class its renders use. Never call it in production: every tag is
 * then registered through a stand-in.
 */
export function enableHotReplacement(): void {
	(globalThis as { __bmHmr?: boolean }).__bmHmr = true;
}

/**
 * The constructor to register for `tag` in place of `target`.
 *
 * Its prototype chain runs through the current implementation, so statics,
 * `instanceof` and decorator metadata read as they would on `target` itself.
 */
export function hotStandIn(tag: string, target: HotConstructor): HotConstructor {
	const record = { current: target } as HotRecord;
	const standIn = function (this: unknown, ...args: unknown[]) {
		return Reflect.construct(record.current, args, new.target);
	} as unknown as HotConstructor;
	Object.defineProperty(standIn, "name", { value: target.name });
	Object.setPrototypeOf(standIn, target);
	standIn.prototype = Object.create(target.prototype, {
		constructor: { value: standIn, writable: true, configurable: true },
	});
	record.standIn = standIn;
	records.set(tag, record);
	return standIn;
}

/**
 * Makes `next` the implementation behind `tag` and rebuilds every live instance
 * from it. Reports the outcome as an {@linkcode HMR_EVENT}.
 */
export function hotSwap(tag: string, next: HotConstructor): HmrEventDetail {
	const detail = swap(tag, next);
	globalThis.dispatchEvent?.(new CustomEvent(HMR_EVENT, { detail }));
	return detail;
}

function swap(tag: string, next: HotConstructor): HmrEventDetail {
	const record = records.get(tag);
	if (!record) return { tag, ok: false, reason: "registered before hot replacement was enabled" };

	const observed = [...(record.current.observedAttributes ?? [])].sort().join();
	if ([...(next.observedAttributes ?? [])].sort().join() !== observed) {
		return { tag, ok: false, reason: "observed attributes changed" };
	}

	const live = typeof document === "undefined" ? [] : findAll(document, tag);
	const snapshots = live.map(snapshot);

	if (isBrowser()) swapStylesheet(tag, record.current.stylesheet, next.stylesheet);

	record.current = next;
	Object.setPrototypeOf(record.standIn, next);
	Object.setPrototypeOf(record.standIn.prototype, next.prototype);

	live.forEach((el, i) => rebuild(el, snapshots[i]));
	return { tag, ok: true };
}

interface Snapshot {
	state: string | null;
	props: [string, unknown][];
}

function snapshot(el: Element): Snapshot {
	const host = el as Element & { serializeState?: () => void } & Record<string, unknown>;
	host.serializeState?.();
	const state = el.getAttribute(STATE_ATTRIBUTE);
	el.removeAttribute(STATE_ATTRIBUTE);

	const props: [string, unknown][] = [];
	for (const name of Object.keys(declaredProps(el.constructor))) {
		const signal = host[name] as { get?: () => unknown } | undefined;
		if (typeof signal?.get === "function") props.push([name, signal.get()]);
	}
	return { state, props };
}

function rebuild(el: Element, { state, props }: Snapshot): void {
	const fresh = document.createElement(el.localName) as unknown as
		& Element
		& Record<string, unknown>;
	for (const attr of el.attributes) fresh.setAttribute(attr.name, attr.value);
	if (state) fresh.setAttribute(STATE_ATTRIBUTE, state);
	for (const [name, value] of props) {
		(fresh[name] as { set?: (v: unknown) => void } | undefined)?.set?.(value);
	}
	if (el.shadowRoot) fresh.append(...el.childNodes);
	el.replaceWith(fresh);
}

function swapStylesheet(
	tag: string,
	prev: string | CSSStyleSheet | undefined,
	next: string | CSSStyleSheet | undefined,
): void {
	if (isSheet(prev)) {
		document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== prev);
	}
	const style = document.head.querySelector(`style#${tag}`);
	if (typeof next === "string") {
		const text = next.replaceAll(/:scope/gm, tag);
		if (style) style.textContent = text;
		else {
			const el = document.createElement("style");
			el.id = tag;
			el.textContent = text;
			document.head.appendChild(el);
		}
		return;
	}
	style?.remove();
	if (isSheet(next)) {
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, next];
	}
}

function isSheet(value: unknown): value is CSSStyleSheet {
	return typeof CSSStyleSheet !== "undefined" && value instanceof CSSStyleSheet;
}

/** Every `tag` element in `root`, including those inside open shadow roots. */
function findAll(root: ParentNode, tag: string): Element[] {
	const found: Element[] = [];
	for (const el of root.querySelectorAll("*")) {
		if (el.localName === tag) found.push(el);
		if (el.shadowRoot) found.push(...findAll(el.shadowRoot, tag));
	}
	return found;
}
