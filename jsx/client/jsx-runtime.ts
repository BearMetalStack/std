export {
	clientFragment as Fragment,
	clientJsx as jsx,
	clientJsx as jsxs,
	setCurrentOwner,
	setEffectImpl,
} from "../lib/jsx.ts";
export type * from "./types.ts";

// // deno-lint-ignore-file no-explicit-any
// import { type BMC, isBMC } from "../lib/bmc.ts";

// // -- Signal duck typing --

// type SignalLike<T = unknown> = { get(): T };

// function isSignal(value: unknown): value is SignalLike {
// 	return (
// 		value !== null &&
// 		typeof value === "object" &&
// 		typeof (value as any).get === "function"
// 	);
// }

// // -- Effect scheduling --
// // Imported from @bearmetal/app, but typed loosely here to avoid hard dep

// type CleanupFn = () => void;
// type EffectFn = (fn: () => CleanupFn | void) => CleanupFn;

// let _effect: EffectFn | null = null;
// let _currentOwner: { registerCleanup(fn: CleanupFn): void } | null = null;

// export function setEffectImpl(impl: EffectFn) {
// 	_effect = impl;
// }

// export function setCurrentOwner(
// 	owner: { registerCleanup(fn: CleanupFn): void } | null,
// ) {
// 	_currentOwner = owner;
// }

// function reactiveEffect(fn: () => CleanupFn | void): void {
// 	if (!_effect) return; // no signal layer loaded, skip silently
// 	const cleanup = _effect(fn);
// 	_currentOwner?.registerCleanup(cleanup);
// }

// // -- Props --

// function applyProps(el: HTMLElement, props: Record<string, unknown>) {
// 	for (const [key, val] of Object.entries(props)) {
// 		if (key === "children") continue;
// 		if (isSignal(val)) {
// 			reactiveEffect(() => applyProp(el, key, val.get()));
// 		} else {
// 			applyProp(el, key, val);
// 		}
// 	}
// }

// function applyProp(el: HTMLElement, key: string, val: unknown) {
// 	if (key === "class") {
// 		el.className = val as string;
// 	} else if (key.startsWith("on") && typeof val === "function") {
// 		el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
// 	} else if (typeof val === "boolean") {
// 		if (val) el.setAttribute(key, "");
// 		else el.removeAttribute(key);
// 	} else if (val != null) {
// 		el.setAttribute(key, String(val));
// 	}
// }

// // -- Children --

// type AnyChild = Node | string | null | undefined;

// function _appendChildren(
// 	parent: Element | DocumentFragment,
// 	children: AnyChild[],
// ) {
// 	for (const child of children) {
// 		if (child == null) continue;
// 		parent.appendChild(
// 			typeof child === "string" ? document.createTextNode(child) : child,
// 		);
// 	}
// }

// function appendReactiveChild(parent: Element | DocumentFragment, signal: SignalLike) {
// 	const text = document.createTextNode(String(signal.get()));
// 	parent.appendChild(text);
// 	reactiveEffect(() => {
// 		text.data = String(signal.get());
// 	});
// }

// function flatChildren(children: unknown): (AnyChild | SignalLike)[] {
// 	if (children == null) return [];
// 	if (Array.isArray(children)) {
// 		return (children as unknown[]).flat(Infinity as 0) as (AnyChild | SignalLike)[];
// 	}
// 	return [children as AnyChild | SignalLike];
// }

// function appendFlatChildren(
// 	parent: Element | DocumentFragment,
// 	children: (AnyChild | SignalLike)[],
// ) {
// 	for (const child of children) {
// 		if (child == null) continue;
// 		if (isSignal(child)) {
// 			appendReactiveChild(parent, child);
// 		} else {
// 			parent.appendChild(
// 				typeof child === "string" ? document.createTextNode(child) : child,
// 			);
// 		}
// 	}
// }

// // -- JSX --

// export function jsx(
// 	tag:
// 		| string
// 		| ((props: Record<string, unknown>) => Element | DocumentFragment)
// 		| typeof BMC,
// 	props: Record<string, unknown>,
// 	_key?: unknown,
// ): Element | DocumentFragment {
// 	const { children, raw, ...rest } = props;
// 	const flat = flatChildren(children);

// 	if (isBMC(tag)) {
// 		const el = document.createElement(tag.tag) as HTMLElement;
// 		applyProps(el, rest);
// 		appendFlatChildren(el, flat);
// 		return el;
// 	}

// 	if (typeof tag === "function") {
// 		return tag(props);
// 	}

// 	if (tag === "template") {
// 		const templateEl = document.createElement("template");
// 		applyProps(templateEl, rest);
// 		appendFlatChildren(templateEl.content as unknown as DocumentFragment, flat);
// 		return templateEl;
// 	}

// 	const el = document.createElement(tag);
// 	applyProps(el, rest);
// 	if (raw) {
// 		for (const child of flat) {
// 			if (child == null) continue;
// 			if (isSignal(child)) {
// 				appendReactiveChild(el, child);
// 			} else if (typeof child === "string") {
// 				el.insertAdjacentHTML("beforeend", child);
// 			} else {
// 				el.appendChild(child);
// 			}
// 		}
// 	} else {
// 		appendFlatChildren(el, flat);
// 	}
// 	return el;
// }

// export const jsxs = jsx;

// export function Fragment(
// 	{ children }: { children?: unknown },
// ): DocumentFragment {
// 	const frag = document.createDocumentFragment();
// 	appendFlatChildren(frag, flatChildren(children));
// 	return frag;
// }

// export type * from "./types.ts";
