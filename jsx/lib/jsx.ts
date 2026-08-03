import { type BMC, isBMC } from "../lib/bmc.ts";

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

type CleanupFn = () => void;
type EffectFn = (fn: () => CleanupFn | void) => CleanupFn;

let _effect: EffectFn | null = null;
export type Owner = {
	registerCleanup(fn: CleanupFn): void;
	registerRef?: (ref: string, el: Element) => void;
	/** Live view of the owner's registered refs, read by `getRefs()`. */
	refs?: Record<string, Element>;
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
	if (isPixelable(key, val)) {
		val = val + "px";
	}
	if (key === "class") {
		const cs = (val as string).split(" ").filter(Boolean);
		if (cs.length) el.classList.add(...cs);
		else el.classList.remove(...el.classList);
	} else if (key.startsWith("class-")) {
		const cs = key.split("-")[1];
		if (val) el.classList.add(cs);
		else el.classList.remove(cs);
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

function isPixelable(key: string, val: unknown): boolean {
	const pixelables = ["width", "height"];
	return typeof val === "number" && pixelables.includes(key);
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
			(el as HTMLInputElement).checked = Boolean(value);
		} else {
			el.value = value == null ? "" : String(value);
		}
	});
	el.addEventListener("input", () => {
		signal.set(coerceBindValue(el, type, cast));
	});
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

function appendReactiveChild(parent: Element | DocumentFragment, signal: SignalLike) {
	const start = document.createTextNode("");
	const end = document.createTextNode("");
	parent.appendChild(start);
	parent.appendChild(end);

	function clearRange(parentNode: Node) {
		let node = start.nextSibling;
		while (node && node !== end) {
			const next = node.nextSibling;
			parentNode.removeChild(node);
			node = next;
		}
	}

	reactiveEffect(() => {
		const v = signal.get();
		const parentNode = end.parentNode;
		if (!parentNode) return;

		if (v instanceof Node) {
			// Already exactly where it belongs — leave it alone. Tearing an
			// identical node out and putting it straight back is not a no-op in the
			// DOM: it restarts CSS animations and transitions, drops focus and text
			// selection, reloads iframes and media, and fires a disconnect/connect
			// pair on every custom element inside it. A signal that recomputes to
			// the same node (a memoised branch, a route whose params changed but
			// whose component did not) must not cost any of that.
			if (start.nextSibling === v && v.nextSibling === end) return;
			clearRange(parentNode);
			parentNode.insertBefore(v, end);
			return;
		}

		const text = v == null ? "" : String(v);
		const only = start.nextSibling;
		if (only && only.nextSibling === end && only.nodeType === 3) {
			(only as Text).data = text;
			return;
		}
		clearRange(parentNode);
		if (text !== "") parentNode.insertBefore(document.createTextNode(text), end);
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

export function clientJsx<T>(
	// deno-lint-ignore no-explicit-any
	tag: (props: any) => T,
	props: Record<string, unknown>,
	_key?: unknown,
): T;
export function clientJsx(
	tag:
		| string
		| typeof BMC,
	props: Record<string, unknown>,
	_key?: unknown,
): Element | DocumentFragment;
export function clientJsx(
	tag:
		| string
		| ((props: Record<string, unknown>) => Element | DocumentFragment)
		| typeof BMC,
	props: Record<string, unknown>,
	_key?: unknown,
): unknown {
	const { children, $raw, ...rest } = props;
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

	if (isTagSVG(tag)) {
		const svgEl = document.createElementNS("http://www.w3.org/2000/svg", tag);
		applyProps(svgEl as unknown as HTMLElement, rest);
		appendFlatChildren(svgEl, flat);
		return svgEl;
	}

	const el = document.createElement(tag);
	applyProps(el, rest);
	if ($raw) {
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

	async function serverJsx<T extends HtmlLike>(
		tag: (props: Record<string, unknown>) => T | Promise<T>,
		props: Record<string, unknown>,
		_key?: unknown,
	): Promise<T>;
	async function serverJsx(
		tag:
			| string
			| typeof BMC,
		props: Record<string, unknown>,
		_key?: unknown,
	): Promise<HtmlLike>;
	async function serverJsx(
		tag:
			| string
			| ((props: Record<string, unknown>) => HtmlLike | Promise<HtmlLike>)
			| typeof BMC,
		props: Record<string, unknown>,
		_key?: unknown,
	): Promise<unknown> {
		const { children, $raw, ...rest } = props;
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

			const childStr = (await Promise.all(flat.map($raw ? resolveChildRaw : resolveChild))).join(
				"",
			);
			const inner = await tag.serverRender(loadedProps, childStr);
			return new Html(`<${tag.tag}${buildAttrs(serialized)}>${inner}</${tag.tag}>`);
		}

		if (typeof tag === "function") {
			return await tag(props);
		}

		const attrs = buildAttrs(rest);
		if (voidElements.has(tag as string)) return new Html(`<${tag}${attrs}>`);
		const childStr = (await Promise.all(flat.map($raw ? resolveChildRaw : resolveChild))).join("");
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
