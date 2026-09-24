/**
 * The JSX runtime. One implementation, both sides.
 *
 * Every element is a real DOM node built with `document.createElement`. On a
 * server that `document` is `@bearmetal/slag`, and the finished tree serializes
 * itself — so there is no second, string-building runtime to keep in step, and
 * no component that behaves differently depending on where it ran.
 *
 * Rendering is synchronous throughout. Asynchronous values are not awaited
 * here; they are registered with `./pending.ts` and patched in when they
 * settle, which is the same thing that happens to a signal.
 */

import { type BMC, isBMC } from "./bmc.ts";
import { Html } from "./html.ts";
import { trackPending } from "./pending.ts";

type SignalLike = { get(): unknown };
type WritableSignalLike = SignalLike & { set(value: unknown): void };

function isSignal(value: unknown): value is SignalLike {
	return (
		value !== null &&
		typeof value === "object" &&
		// deno-lint-ignore no-explicit-any
		typeof (value as any).get === "function"
	);
}

function isWritableSignal(value: unknown): value is WritableSignalLike {
	return (
		isSignal(value) &&
		// deno-lint-ignore no-explicit-any
		typeof (value as any).set === "function"
	);
}

/**
 * Pre-escaped markup, duck-typed rather than `instanceof Html`.
 *
 * Two bundles of this package produce two `Html` classes, and markup handed
 * across that seam has to keep working.
 */
export type HtmlLike = { raw: string; toString(): string };

function isHtmlLike(value: unknown): value is HtmlLike {
	return value !== null && typeof value === "object" &&
		typeof (value as HtmlLike).raw === "string";
}

function isThenable(value: unknown): value is Promise<unknown> {
	// deno-lint-ignore no-explicit-any
	return value !== null && typeof value === "object" && typeof (value as any).then === "function";
}

type CleanupFn = () => void;
type EffectFn = (fn: () => CleanupFn | void) => CleanupFn;
type UntrackFn = <T>(fn: () => T) => T;

let _effect: EffectFn | null = null;
let _untrack: UntrackFn = (fn) => fn();
export type Owner = {
	registerCleanup(fn: CleanupFn): void;
	registerRef?: (ref: string, el: Element) => void;
	/**
	 * The owner's registered refs, read by `getRefs()` — one signal per ref
	 * name, kept signals-implementation-agnostic here the same way
	 * `SignalLike`/`WritableSignalLike` are.
	 */
	refs?: Record<string, WritableSignalLike>;
} | null;

let _currentOwner: Owner = null;

export function setEffectImpl(impl: EffectFn): void {
	_effect = impl;
}

/**
 * Registers the signals implementation's `untrack`, so constructing a
 * component is never observable as a dependency of whatever render happens to
 * be constructing it. See its one call site in `jsx()`, on the `isBMC` branch.
 */
export function setUntrackImpl(impl: UntrackFn): void {
	_untrack = impl;
}

export function setCurrentOwner(
	owner: Owner,
): void {
	_currentOwner = owner;
}
export function getCurrentOwner(): Owner {
	return _currentOwner;
}

function reactiveEffect(fn: () => CleanupFn | void): void {
	if (!_effect) return;
	const cleanup = _effect(fn);
	_currentOwner?.registerCleanup(cleanup);
}

// -- shared util --

export function flatChildren(children: unknown): unknown[] {
	if (children == null) return [];
	if (Array.isArray(children)) {
		return (children as unknown[]).flat(Infinity as 0);
	}
	return [children];
}

/**
 * Parses raw markup into nodes.
 *
 * `<template>` because its content is inert: no `<img>` fetches, no script
 * evaluation, and none of the reparenting the host element's own parser rules
 * would impose. Slag has no HTML parser and keeps the markup verbatim instead,
 * which serializes back out unchanged — the only thing a server needs from it.
 */
function rawFragment(markup: string): DocumentFragment {
	const template = document.createElement("template") as HTMLTemplateElement;
	template.innerHTML = markup;
	return template.content;
}

// -- props --

function applyProp(el: HTMLElement, key: string, val: unknown) {
	if (isPixelable(key, val)) {
		val = val + "px";
	}
	if (key === "class") {
		const e = el as unknown as { prevClassList?: string[] };
		const cs = (val as string).split(" ").filter(Boolean);
		const prev = e.prevClassList ?? [];
		el.classList.remove(...prev);
		e.prevClassList = cs;
		el.classList.add(...cs);
	} else if (key.startsWith("class-")) {
		const cs = key.split("-")[1];
		if (val) el.classList.add(cs);
		else el.classList.remove(cs);
	} else if (key.startsWith("on") && typeof val === "function") {
		el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
	} else if (key === "value" && isFormControl(el)) {
		setControlValue(el, val);
	} else if (typeof val === "boolean") {
		if (val) el.setAttribute(key, "");
		else el.removeAttribute(key);
	} else if (typeof val === "object") {
		// deno-lint-ignore no-explicit-any
		(el as any)[key] = val;
	} else if (val != null) {
		el.setAttribute(key, String(val));
	}
}

/**
 * Mirrors a scalar written to a declared prop onto its attribute.
 *
 * Setting the prop's signal is what the component reads, but a signal leaves
 * nothing in the markup — so without the attribute a server render drops the
 * prop, and `[open]`-style selectors never match. The attribute goes first:
 * `attributeChangedCallback` coerces it back into the signal, and the direct
 * `set()` after it leaves the exact value rather than the coerced one.
 */
function reflectProp(el: Element, key: string, val: unknown): void {
	if (typeof val === "boolean") el.toggleAttribute(key, val);
	else if (typeof val === "string" || typeof val === "number") el.setAttribute(key, String(val));
}

function isPixelable(key: string, val: unknown): boolean {
	const pixelables = ["width", "height"];
	return typeof val === "number" && pixelables.includes(key);
}

function isFormControl(el: Element): boolean {
	return el.localName === "input" || el.localName === "select" || el.localName === "textarea";
}

/**
 * Writes a form control's value both where serialization reads it and where a
 * live control shows it.
 *
 * The property alone updates a control the user has already edited, but never
 * reaches markup — and a server render is nothing but markup. So the value also
 * lands where HTML carries it: the `value` attribute of an `<input>`, the text
 * of a `<textarea>`, the `selected` flag of the matching `<option>`.
 */
function setControlValue(el: Element, val: unknown): void {
	const value = val == null ? "" : String(val);
	if (el.localName === "input") {
		el.setAttribute("value", value);
	} else if (el.localName === "textarea") {
		el.textContent = value;
	} else if (el.localName === "select") {
		for (const option of el.querySelectorAll("option")) {
			const optionValue = option.getAttribute("value") ?? option.textContent?.trim();
			option.toggleAttribute("selected", optionValue === value);
		}
	}
	(el as HTMLInputElement).value = value;
}

function isCheckable(type: unknown): boolean {
	return type === "checkbox" || type === "radio";
}

function isTagSVG(tag: string): boolean {
	return [
		"svg",
		"g",
		"circle",
		"rect",
		"path",
		"ellipse",
		"line",
		"text",
		"polygon",
		"polyline",
		"defs",
		"tspan",
		"textPath",
		"animate",
		"animateTransform",
		"set",
		"use",
		"linearGradient",
		"radialGradient",
		"filter",
	]
		.includes(tag) || Boolean(tag.match(/^(fe)/));
}

function coerceBindValue(
	el: HTMLInputElement | HTMLTextAreaElement,
	type: unknown,
	cast: ((raw: string | boolean) => unknown) | undefined,
): unknown {
	const raw: string | boolean = isCheckable(type) ? (el as HTMLInputElement).checked : el.value;
	if (cast) return cast(raw);
	if (type === "number" || type === "range") return Number(raw);
	if (isCheckable(type)) return Boolean(raw);
	return raw;
}

function applyBind(
	el: HTMLInputElement | HTMLTextAreaElement,
	signal: WritableSignalLike,
	type: unknown,
	cast: ((raw: string | boolean) => unknown) | undefined,
) {
	reactiveEffect(() => {
		const value = signal.get();
		if (isCheckable(type)) {
			el.toggleAttribute("checked", Boolean(value));
			(el as HTMLInputElement).checked = Boolean(value);
		} else {
			setControlValue(el, value);
		}
	});
	el.addEventListener("input", () => {
		signal.set(coerceBindValue(el, type, cast));
	});
}

// -- prop handlers --

/**
 * Applies one prop to the element the runtime just built.
 *
 * Returning a function registers it as cleanup with the owning component, so a
 * handler that attaches a listener or allocates something can let go of it when
 * the component is disposed. Under a signal value the handler runs inside an
 * effect instead, and the returned cleanup runs before each re-run.
 */
export type PropHandler = (
	el: Element,
	value: unknown,
	key: string,
) => CleanupFn | void;

/** Options for {@linkcode registerPropHandler}. */
export interface PropHandlerOptions {
	/**
	 * Hand the handler the value exactly as written, signals included, instead
	 * of unwrapping it in an effect.
	 *
	 * For a handler that wants to own the subscription — or to write back, the
	 * way `$bind` does.
	 */
	raw?: boolean;
}

type PropHandlerEntry = { handler: PropHandler; raw: boolean };

const _propHandlers = new Map<string, PropHandlerEntry>();

/**
 * Props the runtime's own structure depends on. A handler cannot take these
 * over: `children` and `$raw` are consumed before props are applied at all,
 * `ref` belongs to the owning component, and `$bind`/`$type` are destructured
 * out of the prop bag.
 */
const RESERVED_PROPS = ["children", "ref", "$raw", "$bind", "$type"];

/**
 * Claims a prop name, on every element, for `handler`.
 *
 * The runtime's default handling of that prop — attribute, property, event
 * listener — is skipped entirely; the handler is the whole behaviour. This is
 * the supported way for a library to add a prop of its own:
 *
 * ```ts
 * registerPropHandler("contextMenu", (el, value) => registerContextMenu(el, value));
 * ```
 *
 * with the matching type declared by merging into
 * {@linkcode CustomProps}. Names are matched exactly as written in the JSX, so
 * `contextMenu` and `contextmenu` are two different props.
 *
 * Registering is global and process-wide, so two libraries claiming the same
 * name is a conflict rather than a last-one-wins race: it throws, naming the
 * prop. Re-registering the identical function is a no-op, so a module that is
 * evaluated twice is fine.
 *
 * @returns a function that unregisters this handler.
 */
export function registerPropHandler(
	key: string,
	handler: PropHandler,
	options: PropHandlerOptions = {},
): () => void {
	if (RESERVED_PROPS.includes(key)) {
		throw new Error(`"${key}" is reserved by the JSX runtime and cannot have a prop handler`);
	}
	const existing = _propHandlers.get(key);
	if (existing && existing.handler !== handler) {
		throw new Error(
			`A prop handler for "${key}" is already registered. Two libraries cannot claim the ` +
				`same prop; unregister the first one, or pick another name.`,
		);
	}
	_propHandlers.set(key, { handler, raw: Boolean(options.raw) });
	return () => {
		if (_propHandlers.get(key)?.handler === handler) _propHandlers.delete(key);
	};
}

/** The handler claiming `key`, if any. */
export function getPropHandler(key: string): PropHandler | undefined {
	return _propHandlers.get(key)?.handler;
}

function applyHandledProp(
	entry: PropHandlerEntry,
	el: HTMLElement,
	key: string,
	val: unknown,
) {
	if (!entry.raw && isSignal(val)) {
		reactiveEffect(() => entry.handler(el, val.get(), key));
		return;
	}
	const cleanup = entry.handler(el, val, key);
	if (typeof cleanup === "function") _currentOwner?.registerCleanup(cleanup);
}

function applyProps(el: HTMLElement, props: Record<string, unknown>) {
	const { $bind, $type, ...attrs } = props;
	if (el.tagName === "BUTTON" && !("type" in props)) {
		el.setAttribute("type", "button");
	}
	for (const [key, val] of Object.entries(attrs)) {
		if (key === "children") continue;
		if (key === "ref" && typeof val === "string" && _currentOwner?.registerRef) {
			_currentOwner.registerRef(val, el);
			continue;
		}
		const handler = _propHandlers.get(key);
		if (handler) {
			applyHandledProp(handler, el, key, val);
			continue;
		}
		// deno-lint-ignore no-explicit-any
		const existing = (el as any)[key];
		if (isWritableSignal(val) && isWritableSignal(existing)) {
			// deno-lint-ignore no-explicit-any
			(el as any)[key] = val;
			continue;
		}
		if (isSignal(val)) {
			reactiveEffect(() => applyProp(el, key, val.get()));
		} else if (isWritableSignal(existing)) {
			reflectProp(el, key, val);
			existing.set(val);
		} else {
			applyProp(el, key, val);
		}
	}
	if ($bind !== undefined) {
		if (!isWritableSignal($bind)) {
			throw new Error("$bind requires a writable signal (an object with get() and set())");
		}
		applyBind(
			el as HTMLInputElement | HTMLTextAreaElement,
			$bind,
			attrs.type,
			$type as ((raw: string | boolean) => unknown) | undefined,
		);
	}
}

// -- children --

/**
 * Inserts one resolved value before `before`.
 *
 * `raw` decides what a bare string means: escaped text by default, markup under
 * `$raw`. An `Html` value is markup either way — being already escaped is what
 * the type says about it.
 */
function insertValue(
	parent: Node,
	value: unknown,
	before: Node | null,
	raw = false,
): void {
	if (value == null || value === false || value === true) return;
	if (Array.isArray(value)) {
		for (const item of value.flat(Infinity as 0)) insertValue(parent, item, before, raw);
		return;
	}
	if (isHtmlLike(value)) {
		parent.insertBefore(rawFragment(value.raw), before);
		return;
	}
	if (value instanceof Node) {
		parent.insertBefore(value, before);
		return;
	}
	const text = String(value);
	if (text === "") return;
	parent.insertBefore(raw ? rawFragment(text) : document.createTextNode(text), before);
}

/** Removes everything strictly between two marker nodes. */
function clearRange(parent: Node, start: Node, end: Node): void {
	let node = start.nextSibling;
	while (node && node !== end) {
		const next = node.nextSibling;
		parent.removeChild(node);
		node = next;
	}
}

/** A pair of empty text nodes bracketing a slot whose content changes. */
function markRange(parent: Node): { start: Node; end: Node } {
	const start = document.createTextNode("");
	const end = document.createTextNode("");
	parent.appendChild(start);
	parent.appendChild(end);
	return { start, end };
}

function appendReactiveChild(parent: Element | DocumentFragment, signal: SignalLike, raw: boolean) {
	const { start, end } = markRange(parent);

	reactiveEffect(() => {
		const v = signal.get();
		const parentNode = end.parentNode;
		if (!parentNode) return;

		if (v instanceof Node) {
			if (start.nextSibling === v && v.nextSibling === end) return;
			clearRange(parentNode, start, end);
			parentNode.insertBefore(v, end);
			return;
		}

		if (!raw && !isHtmlLike(v) && !Array.isArray(v)) {
			const text = v == null || v === false || v === true ? "" : String(v);
			const only = start.nextSibling;
			if (only && only.nextSibling === end && only.nodeType === 3) {
				(only as Text).data = text;
				return;
			}
			clearRange(parentNode, start, end);
			if (text !== "") parentNode.insertBefore(document.createTextNode(text), end);
			return;
		}

		clearRange(parentNode, start, end);
		insertValue(parentNode, v, end, raw);
	});
}

/**
 * Reserves a slot for a value that has not arrived yet, and registers the wait
 * with the current server render.
 *
 * In a browser this is only a promise filling its slot in when it resolves;
 * nothing is tracking it and nothing waits. On a server the renderer holds the
 * markup back until every registered promise has settled, so an `async`
 * component's output lands in the response instead of racing it.
 */
function appendPendingChild(
	parent: Element | DocumentFragment,
	work: Promise<unknown>,
	raw: boolean,
) {
	const { start, end } = markRange(parent);

	trackPending(
		work.then((value) => {
			const parentNode = end.parentNode;
			if (!parentNode) return;
			clearRange(parentNode, start, end);
			insertValue(parentNode, value, end, raw);
		}),
	);
}

function appendFlatChildren(
	parent: Element | DocumentFragment,
	children: unknown[],
	raw = false,
) {
	for (const child of children) {
		if (child == null || child === false || child === true) continue;
		if (isThenable(child)) {
			appendPendingChild(parent, child, raw);
		} else if (isSignal(child)) {
			appendReactiveChild(parent, child, raw);
		} else {
			insertValue(parent, child, null, raw);
		}
	}
}

// -- the runtime --

export function jsx<T>(
	// deno-lint-ignore no-explicit-any
	tag: (props: any) => T,
	props: Record<string, unknown>,
	_key?: unknown,
): T;
export function jsx(
	tag:
		| string
		| typeof BMC,
	props: Record<string, unknown>,
	_key?: unknown,
): Element | DocumentFragment;
export function jsx(
	tag:
		| string
		| ((props: Record<string, unknown>) => Element | DocumentFragment)
		| typeof BMC,
	props: Record<string, unknown>,
	_key?: unknown,
): unknown {
	const { children, $raw, ...rest } = props;
	const flat = flatChildren(children);
	const raw = Boolean($raw);

	if (isBMC(tag)) {
		const el = _untrack(() => {
			const el = document.createElement(tag.tag) as HTMLElement;
			applyProps(el, rest);
			return el;
		});
		appendFlatChildren(el, flat, raw);
		return el;
	}

	if (typeof tag === "function") {
		return tag(props);
	}

	if (tag === "template") {
		const templateEl = document.createElement("template") as HTMLTemplateElement;
		applyProps(templateEl, rest);
		appendFlatChildren(templateEl.content, flat, raw);
		return templateEl;
	}

	if (isTagSVG(tag)) {
		const svgEl = document.createElementNS("http://www.w3.org/2000/svg", tag);
		applyProps(svgEl as unknown as HTMLElement, rest);
		appendFlatChildren(svgEl, flat, raw);
		return svgEl;
	}

	const el = document.createElement(tag);
	if (tag === "select") {
		// A select's value picks one of its options, so they have to exist first.
		appendFlatChildren(el, flat, raw);
		applyProps(el, rest);
		return el;
	}
	applyProps(el, rest);
	appendFlatChildren(el, flat, raw);
	return el;
}

export { jsx as jsxs };

export function Fragment(
	{ children, $raw }: { children?: unknown; $raw?: unknown },
): DocumentFragment {
	const frag = document.createDocumentFragment();
	appendFlatChildren(frag, flatChildren(children), Boolean($raw));
	return frag;
}

export { Html };
