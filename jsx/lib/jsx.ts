import { type BMC, isBMC } from "../lib/bmc.ts";

type SignalLike = { get(): unknown };

function isSignal(value: unknown): value is SignalLike {
	return (
		value !== null &&
		typeof value === "object" &&
		// deno-lint-ignore no-explicit-any
		typeof (value as any).get === "function"
	);
}

type CleanupFn = () => void;
type EffectFn = (fn: () => CleanupFn | void) => CleanupFn;

let _effect: EffectFn | null = null;
type Owner = {
	registerCleanup(fn: CleanupFn): void;
	registerRef?: (ref: string, el: Element) => void;
} | null;

let _currentOwner: Owner = null;

export function setEffectImpl(impl: EffectFn): void {
	_effect = impl;
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

// -- client impl --

function applyProp(el: HTMLElement, key: string, val: unknown) {
	if (key === "class") {
		el.className = val as string;
	} else if (key.startsWith("on") && typeof val === "function") {
		el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
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

function applyProps(el: HTMLElement, props: Record<string, unknown>) {
	for (const [key, val] of Object.entries(props)) {
		if (key === "children") continue;
		if (key === "ref" && typeof val === "string" && _currentOwner?.registerRef) {
			_currentOwner.registerRef(val, el);
			continue;
		}
		if (isSignal(val)) {
			reactiveEffect(() => applyProp(el, key, val.get()));
		} else {
			applyProp(el, key, val);
		}
	}
}

function appendReactiveChild(parent: Element | DocumentFragment, signal: SignalLike) {
	const getValue = () => {
		const v = signal.get();
		if (v instanceof Node) return "";
		return v == null ? "" : String(v);
	};
	const initial = signal.get();
	if (initial instanceof Node) {
		parent.appendChild(initial);
		return;
	}
	const text = document.createTextNode(getValue());
	parent.appendChild(text);
	reactiveEffect(() => {
		text.data = getValue();
	});
}

function appendFlatChildren(
	parent: Element | DocumentFragment,
	children: unknown[],
) {
	for (const child of children) {
		if (child == null) continue;
		if (isSignal(child)) {
			appendReactiveChild(parent, child);
		} else if (child instanceof Node) {
			parent.appendChild(child);
		} else {
			parent.appendChild(document.createTextNode(String(child)));
		}
	}
}

export function clientJsx(
	tag:
		| string
		| ((props: Record<string, unknown>) => Element | DocumentFragment)
		| typeof BMC,
	props: Record<string, unknown>,
	_key?: unknown,
): Element | DocumentFragment {
	const { children, raw, ...rest } = props;
	const flat = flatChildren(children);

	if (isBMC(tag)) {
		const el = document.createElement(tag.tag) as HTMLElement;
		applyProps(el, rest);
		appendFlatChildren(el, flat);
		return el;
	}

	if (typeof tag === "function") {
		return tag(props);
	}

	if (tag === "template") {
		const templateEl = document.createElement("template");
		applyProps(templateEl, rest);
		appendFlatChildren(templateEl.content, flat);
		return templateEl;
	}

	const el = document.createElement(tag);
	applyProps(el, rest);
	if (raw) {
		for (const child of flat) {
			if (child == null) continue;
			if (isSignal(child)) {
				appendReactiveChild(el, child);
			} else if (typeof child === "string") {
				el.insertAdjacentHTML("beforeend", child);
			} else if (child instanceof Node) {
				el.appendChild(child);
			}
		}
	} else {
		appendFlatChildren(el, flat);
	}
	return el;
}

export function clientFragment(
	{ children }: { children?: unknown },
): DocumentFragment {
	const frag = document.createDocumentFragment();
	appendFlatChildren(frag, flatChildren(children));
	return frag;
}

// -- server impl --

const voidElements = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

export type HtmlLike = { raw: string; toString(): string };
type HtmlCtor = new (raw: string) => HtmlLike;

export function makeServerJsx(Html: HtmlCtor, escapeHtml: (s: string) => string) {
	function childToStr(c: unknown): string {
		if (c && typeof c === "object" && "raw" in c) return (c as HtmlLike).raw;
		if (c == null || c === false) return "";
		if (typeof c === "string") return escapeHtml(c);
		return escapeHtml(String(c));
	}

	function childToStrRaw(c: unknown): string {
		if (c && typeof c === "object" && "raw" in c) return (c as HtmlLike).raw;
		if (c == null || c === false) return "";
		return String(c);
	}

	function buildAttrs(props: Record<string, unknown>): string {
		return Object.entries(props)
			.filter(([k]) => k !== "children")
			.flatMap(([k, v]) => {
				if (v == null || v === false || typeof v === "function") return [];
				if (v === true) return [` ${k}`];
				return [` ${k}="${escapeHtml(String(v))}"`];
			})
			.join("");
	}

	async function resolveChild(c: unknown): Promise<string> {
		if (isSignal(c)) c = c.get();
		if (c instanceof Promise) c = await c;
		return childToStr(c);
	}

	async function resolveChildRaw(c: unknown): Promise<string> {
		if (isSignal(c)) c = c.get();
		if (c instanceof Promise) c = await c;
		return childToStrRaw(c);
	}

	async function serverJsx(
		tag:
			| string
			| ((props: Record<string, unknown>) => HtmlLike | Promise<HtmlLike>)
			| typeof BMC,
		props: Record<string, unknown>,
		_key?: unknown,
	): Promise<HtmlLike> {
		const { children, raw, ...rest } = props;
		const flat = flatChildren(children);

		if (isBMC(tag)) {
			if (tag.client) {
				return new Html(`<${tag.tag}${buildAttrs(rest)}></${tag.tag}>`);
			}

			const loaded = tag.serverLoad ? await tag.serverLoad(rest) : {};
			const loadedProps = { ...rest, ...loaded };
			const serialized = Object.keys(loaded).length
				? { ...loadedProps, "data-server-props": btoa(JSON.stringify(loaded)) }
				: loadedProps;

			const childStr = (await Promise.all(flat.map(raw ? resolveChildRaw : resolveChild))).join("");
			const inner = await tag.serverRender(loadedProps, childStr);
			return new Html(`<${tag.tag}${buildAttrs(serialized)}>${inner}</${tag.tag}>`);
		}

		if (typeof tag === "function") {
			return await tag(props);
		}

		const attrs = buildAttrs(rest);
		if (voidElements.has(tag as string)) return new Html(`<${tag}${attrs}>`);
		const childStr = (await Promise.all(flat.map(raw ? resolveChildRaw : resolveChild))).join("");
		return new Html(`<${tag}${attrs}>${childStr}</${tag}>`);
	}

	async function serverFragment(
		{ children }: { children?: unknown },
	): Promise<HtmlLike> {
		return new Html(
			(await Promise.all(flatChildren(children).map(resolveChild))).join(""),
		);
	}

	return { jsx: serverJsx, jsxs: serverJsx, Fragment: serverFragment };
}
